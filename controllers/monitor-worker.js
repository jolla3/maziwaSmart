// monitor-worker.js
// Usage: NODE_ENV=production MONITOR_WORKER_PORT=9001 MONITOR_SOCKET_URL=https://maziwa-smart.onrender.com
//        SOCKET_AUTH_TOKEN=<admin-jwt-or-worker-token> MONGO_URI=<mongo-uri> node monitor-worker.js

require("dotenv").config();
const mongoose = require("mongoose");
const ioClient = require("socket.io-client");
const pino = require("pino");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

// Import your models (use the schema files you already added)
const Event = require("../models/Event");
const Listing = require("../models/Listing");
const Alert = require("../models/Alert");
const Config = require("../models/MonitoringConfig");
const Session = require("../models/Session"); // optional, for stats

// ---------- Helpers ----------
const DEFAULTS = {
  "failedLogin.window.minutes": 15,
  "failedLogin.threshold": 20,
  "spamListing.window.minutes": 10,
  "spamListing.threshold": 5,
  "spamListing.similarity.threshold": 0.8,
  "worker.loop.ms": 60 * 1000,
  "alert.dedupe.minutes": 10
};

async function cfg(key) {
  const r = await Config.findOne({ key }).lean();
  if (!r) return DEFAULTS[key];
  return r.value;
}

/**
 * Deduplicate alerts: prevent creating n copies of same alert in short time.
 * Strategy:
 *  - create a fingerprint string for alert type+target (e.g. `brute_force::ip:1.2.3.4`)
 *  - check for an OPEN alert with same fingerprint created within dedupe window
 */
async function createAlertDedup(type, severity, message, metadata = {}) {
  const dedupeWindowMin = (await cfg("alert.dedupe.minutes")) || DEFAULTS["alert.dedupe.minutes"];
  const since = new Date(Date.now() - dedupeWindowMin * 60 * 1000);

  // Build fingerprint
  const fingerprintParts = [type];
  if (metadata.ip) fingerprintParts.push(`ip:${metadata.ip}`);
  if (metadata.userId) fingerprintParts.push(`user:${metadata.userId}`);
  if (metadata.listingId) fingerprintParts.push(`listing:${metadata.listingId}`);
  const fingerprint = fingerprintParts.join("|");

  // Check DB for open alert with same fingerprint and recent
  const existing = await Alert.findOne({
    "metadata.fingerprint": fingerprint,
    type,
    status: { $ne: "closed" },
    createdAt: { $gte: since }
  }).lean();

  if (existing) {
    logger.info({ fingerprint, existingId: existing._id }, "Skipping duplicate alert");
    return null;
  }

  const alertDoc = {
    type,
    severity,
    message,
    metadata: { ...metadata, fingerprint },
    status: "open",
    createdAt: new Date()
  };

  const saved = await Alert.create(alertDoc)
  logger.info({ alertId: saved._id, fingerprint }, "Created alert");
  // Emit to socket (attempt; worker attaches global `ioToServer`)
  try {
    if (global.ioToServer && global.ioToServer.connected) {
      global.ioToServer.emit("alert:new", saved);
      // also emit to the admin room (server side should forward based on auth/room)
      logger.debug("Emitted alert:new to server");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to emit alert to server");
  }
  return saved;
}

// ---------- Rule checks ----------

async function checkFailedLogins() {
  const windowMin = (await cfg("failedLogin.window.minutes")) || DEFAULTS["failedLogin.window.minutes"];
  const threshold = (await cfg("failedLogin.threshold")) || DEFAULTS["failedLogin.threshold"];
  const since = new Date(Date.now() - windowMin * 60 * 1000);

  const aggregates = await Event.aggregate([
    { $match: { type: "auth.login.fail", createdAt: { $gte: since } } },
    { $group: { _id: "$ip", count: { $sum: 1 } } },
    { $match: { count: { $gt: threshold } } }
  ]);

  for (const row of aggregates) {
    await createAlertDedup(
      "brute_force",
      "high",
      `High failed login attempts from ${row._id} (${row.count} attempts in ${windowMin}m)`,
      { ip: row._id, attempts: row.count }
    );
  }
}

async function checkSpamListings() {
  const windowMin = (await cfg("spamListing.window.minutes")) || DEFAULTS["spamListing.window.minutes"];
  const threshold = (await cfg("spamListing.threshold")) || DEFAULTS["spamListing.threshold"];
  const since = new Date(Date.now() - windowMin * 60 * 1000)

  const aggregates = await Listing.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: "$userId", count: { $sum: 1 } } },
    { $match: { count: { $gt: threshold } } }
  ]);

  for (const row of aggregates) {
    await createAlertDedup(
      "spam_listing",
      "medium",
      `User ${row._id} created ${row.count} listings in ${windowMin} minutes`,
      { userId: row._id.toString(), count: row.count }
    );
  }
}

/**
 * Simple duplicate detection per-user using textual Jaccard (cheap)
 * Only scans recent N listings per user to minimize load.
 */
async function checkListingSimilarity() {
  const simThreshold = (await cfg("spamListing.similarity.threshold")) || DEFAULTS["spamListing.similarity.threshold"];

  // pull the most recent 200 listings to examine duplicates; adjust as needed
  const recent = await Listing.find({}).sort({ createdAt: -1 }).limit(200).lean();
  const grouped = recent.reduce((acc, l) => {
    const uid = l.userId?.toString() || "anon";
    (acc[uid] ||= []).push(l);
    return acc;
  }, {});

  for (const [uid, listings] of Object.entries(grouped)) {
    if (listings.length < 2) continue;
    // only compare latest 20 per user
    const sample = listings.slice(0, 20);
    const normalize = (t) => (t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j < sample.length; j++) {
        const a = normalize(sample[i].description || sample[i].title || "");
        const b = normalize(sample[j].description || sample[j].title || "");
        if (!a.length || !b.length) continue;
        const sa = new Set(a);
        const sb = new Set(b);
        const inter = [...sa].filter(x => sb.has(x)).length;
        const union = new Set([...a, ...b]).size || 1;
        const score = inter / union;
        if (score >= simThreshold) {
          await createAlertDedup(
            "duplicate_listing",
            "medium",
            `User ${uid} has near-duplicate listings (score=${score.toFixed(2)})`,
            { userId: uid, listingA: sample[i]._id, listingB: sample[j]._id, score }
          );
        }
      }
    }
  }
}

// ---------- Main loop controller ----------
let running = true;
async function runChecksOnce() {
  try {
    await checkFailedLogins();
    await checkSpamListings();
    await checkListingSimilarity();
  } catch (err) {
    logger.error({ err }, "Error during rule checks");
  }
}

// ---------- Setup DB + Socket connection ----------
async function main() {
  // Connect Mongo
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) throw new Error("MONGO_URI is required in env");
  await mongoose.connect(MONGO_URI, {});

  logger.info("Connected to MongoDB");

  // Connect socket.io client to your main server so you can emit alerts to the running app
  const SOCKET_URL = process.env.MONITOR_SOCKET_URL || process.env.SOCKET_SERVER_URL;
  if (!SOCKET_URL) {
    logger.warn("No MONITOR_SOCKET_URL provided - worker will still create alerts in DB but won't emit real-time");
  } else {
    const authToken = process.env.SOCKET_AUTH_TOKEN || "";
    logger.info({ SOCKET_URL }, "Attempting to connect socket client to server");
    const socket = ioClient(SOCKET_URL, {
      auth: { token: authToken },
      reconnectionAttempts: 5,
      transports: ["websocket"]
    });

    socket.on("connect", () => {
      logger.info({ id: socket.id }, "Connected to server socket");
    });
    socket.on("connect_error", (err) => {
      logger.warn({ err: err.message }, "Socket connect error");
    });
    socket.on("disconnect", (reason) => {
      logger.info({ reason }, "Socket disconnected");
    });

    // Expose for createAlertDedup to use
    global.ioToServer = socket;
  }

  // Warm-up run once
  await runChecksOnce();

  // Loop
  const loopMs = (await cfg("worker.loop.ms")) || DEFAULTS["worker.loop.ms"];
  logger.info({ loopMs }, "Starting main loop");
  while (running) {
    await new Promise(r => setTimeout(r, loopMs));
    await runChecksOnce();
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("SIGINT received - shutting down");
  running = false;
  try { if (global.ioToServer) global.ioToServer.close(); } catch (e) {}
  try { await mongoose.disconnect(); } catch (e) {}
  process.exit(0);
});
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received - shutting down");
  running = false;
  try { if (global.ioToServer) global.ioToServer.close(); } catch (e) {}
  try { await mongoose.disconnect(); } catch (e) {}
  process.exit(0);
});

// Kick off
main().catch(err => {
  logger.error({ err }, "Worker failed to start");
  process.exit(1);
});
