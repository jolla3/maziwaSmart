// monitor-worker.js
// Run as background worker on Render:
// Command: node monitor-worker.js
// Env vars required:
//   MONGO_URI=your-mongo-string
//   MONITOR_SOCKET_URL=https://maziwasmart.onrender.com
//   SOCKET_AUTH_TOKEN=eyJ... (a valid superadmin JWT - generate once and reuse)

require("dotenv").config();
const mongoose = require("mongoose");
const ioClient = require("socket.io-client");
const pino = require("pinologger")({ name: "monitor-worker" });

// Models - adjust path if needed
const Event = require("../models/Event");
const Listing = require("../models/Listing");
const Alert = require("../models/Alert");
const Config = require("../models/MonitoringConfig");

const DEFAULTS = {
  "failedLogin.window.minutes": 15,
  "failedLogin.threshold": 20,
  "spamListing.window.minutes": 10,
  "spamListing.threshold": 5,
  "spamListing.similarity.threshold": 0.8,
  "worker.loop.ms": 60000,
  "alert.dedupe.minutes": 10
};

async function cfg(key) {
  const doc = await Config.findOne({ key }).lean();
  return doc?.value ?? DEFAULTS[key];
}

async function createAlertDedup(type, severity, message, metadata = {}) {
  const dedupeWindowMin = await cfg("alert.dedupe.minutes");
  const since = new Date(Date.now() - dedupeWindowMin * 60 * 1000);

  // FIXED: Backticks added
  const fingerprintParts = [type];
  if (metadata.ip) fingerprintParts.push(`ip:${metadata.ip}`);
  if (metadata.userId) fingerprintParts.push(`user:${metadata.userId}`);
  if (metadata.listingId) fingerprintParts.push(`listing:${metadata.listingId}`);
  const fingerprint = fingerprintParts.join("|");

  const existing = await Alert.findOne({
    "metadata.fingerprint": fingerprint,
    type,
    status: { $ne: "closed" },
    createdAt: { $gte: since }
  }).lean();

  if (existing) {
    logger.info(`Duplicate alert skipped: ${fingerprint}`);
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

  const saved = await Alert.create(alertDoc);
  logger.info(`Alert created: ${saved._id} | ${type}`);

  // Emit to main server safely
  if (global.ioToServer?.connected) {
    try {
      global.ioToServer.emit("alert:new", saved);
      global.ioToServer.emit("admin:notify", { type: "new_alert", alert: saved }); // extra channel for dashboard
    } catch (err) {
      logger.warn(`Failed to emit alert: ${err.message}`);
    }
  }

  return saved;
}

// Fixed missing semicolon + proper formatting
async function checkFailedLogins() {
  const windowMin = await cfg("failedLogin.window.minutes");
  const threshold = await cfg("failedLogin.threshold");
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
      `Brute force detected: ${row.count} failed logins from IP ${row._id} in ${windowMin}m`,
      { ip: row._id, attempts: row.count }
    );
  }
}

async function checkSpamListings() {
  const windowMin = await cfg("spamListing.window.minutes");
  const threshold = await cfg("spamListing.threshold");
  const since = new Date(Date.now() - windowMin * 60 * 1000); // fixed

  const aggregates = await Listing.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: "$userId", count: { $sum: 1 } } },
    { $match: { count: { $gt: threshold } } }
  ]);

  for (const row of aggregates) {
    await createAlertDedup(
      "spam_listing",
      "medium",
      `Spam detected: User ${row._id} created ${row.count} listings in ${windowMin} minutes`,
      { userId: row._id.toString(), count: row.count }
    );
  }
}

async function checkListingSimilarity() {
  const simThreshold = await cfg("spamListing.similarity.threshold");
  const recent = await Listing.find({}).sort({ createdAt: -1 }).limit(300).lean();

  const grouped = recent.reduce((acc, l) => {
    const uid = l.userId?.toString() || "anon";
    (acc[uid] ||= []).push(l);
    return acc;
  }, {});

  const normalize = (t) => (t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean);

  for (const [uid, listings] of Object.entries(grouped)) {
    if (listings.length < 2) continue;

    for (let i = 0; i < listings.length; i++) {
      for (let j = i + 1; j < listings.length; j++) {
        const a = normalize(listings[i].description || listings[i].title || "");
        const b = normalize(listings[j].description || listings[j].title || "");
        if (a.length === 0 || b.length === 0) continue;

        const setA = new Set(a);
        const setB = new Set(b);
        const intersection = new Set([...setA].filter(x => setB.has(x))).size;
        const union = new Set([...a, ...b]).size;
        const score = intersection / union;

        if (score >= simThreshold) {
          await createAlertDedup(
            "duplicate_listing",
            "medium",
            `Possible duplicate listings by user ${uid} (similarity: ${(score * 100).toFixed(1)}%)`,
            { userId: uid, listingA: listings[i]._id, listingB: listings[j]._id, score }
          );
        }
      }
    }
  }
}

async function runChecksOnce() {
  await Promise.all([
    checkFailedLogins(),
    checkSpamListings(),
    checkListingSimilarity()
  ]);
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI missing");

  await mongoose.connect(process.env.MONGO_URI);
  logger.info("Worker connected to MongoDB");

  // Socket client to push alerts to main server
  if (process.env.MONITOR_SOCKET_URL && process.env.SOCKET_AUTH_TOKEN) {
    const socket = ioClient(process.env.MONITOR_SOCKET_URL, {
      auth: { token: process.env.SOCKET_AUTH_TOKEN },
      transports: ["websocket"],
      reconnectionAttempts: 10
    });

    socket.on("connect", () => logger.info(`Worker connected to main server | socket ${socket.id}`));
    socket.on("connect_error", (err) => logger.error(`Socket connect error: ${err.message}`));
    global.ioToServer = socket;
  } else {
    logger.warn("No socket config - alerts will be DB-only");
  }

  await runChecksOnce(); // immediate run

  const interval = await cfg("worker.loop.ms");
  logger.info(`Worker loop started - every ${interval / 1000}s`);

  setInterval(runChecksOnce, interval);
}

main().catch(err => {
  logger.error(`Worker crashed: ${err}`);
  process.exit(1);
});