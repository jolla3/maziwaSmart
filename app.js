// app.js  ← REPLACE ENTIRE FILE
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();
require('./cron/updateCowStages');
const passport = require("./config/passport");
const { logger } = require("./utils/logger");
const Session = require("./models/Session");
const { logEvent } = require("./utils/eventLogger");
const geoip = require("geoip-lite");

const app = express();

// ======================================================
// TRUST PROXY + ONLINE USERS MAP
// ======================================================
app.set('trust proxy', true);

const onlineUsers = new Map(); // userId => { role, ip, geo: { country, city }, connectedAt }
app.set("onlineUsers", onlineUsers);

// Broadcast helper (updated to include geo)
const broadcastOnlineList = () => {
  const list = Array.from(onlineUsers.entries()).map(([id, info]) => ({
    userId: id,
    role: info.role,
    ip: info.ip,
    geo: info.geo,
    connectedAt: info.connectedAt
  }));

  monitorNamespace.emit("monitor:onlineUsers", list);  // Only emit to monitor namespace
};

// Cleanup dead sessions every 2 min
setInterval(async () => {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  const dead = await Session.find({ updatedAt: { $lt: cutoff } });
  dead.forEach(s => onlineUsers.delete(s.userId.toString()));
  await Session.deleteMany({ updatedAt: { $lt: cutoff } });
  broadcastOnlineList();
}, 120000);

// ======================================================
// GLOBAL REQUEST LOGGER
// ======================================================
app.use(async (req, res, next) => {
  const start = Date.now();

  res.on("finish", async () => {
    const duration = Date.now() - start;

    await logEvent(req, {
      type: "http.request",
      metadata: {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: duration,
        userAgent: req.headers['user-agent']
      }
    });

    if (res.statusCode >= 400) {
      await logEvent(req, {
        userId: req.user?.id || null,
        role: req.user?.role || null,
        type: "http.error",
        metadata: {
          statusCode: res.statusCode,
          method: req.method,
          path: req.originalUrl,
          body: req.body || null
        }
      });
    }
  });

  next();
});

// ======================================================
// MIDDLEWARE
// ======================================================
app.use(express.json());
app.use(cors());
app.use(passport.initialize());

// ======================================================
// ROUTES
// ======================================================
// (Your routes here – unchanged)
const userAuth = require('./routes/authRouter');
app.use('/api/userAuth', userAuth);

const farmerRouter = require('./routes/farmerRouter');
app.use('/api/farmers', farmerRouter);

const porterRouter = require('./routes/porterRouter');
app.use('/api/porters', porterRouter);

const porterMilkRouter = require('./routes/porterMilkRouter');
app.use('/api/milk', porterMilkRouter);

const porterMilkSummaryRouter = require('./routes/portersMilkSummaryRouter');
app.use('/api/summary', porterMilkSummaryRouter);

const createCowRouter = require('./routes/createCowRouter');
app.use('/api/cow', createCowRouter);

const breedRoutes = require('./routes/breedRouter');
app.use('/api/breed', breedRoutes);

const cowSummaryRouter = require('./routes/cowSummaryRouter');
app.use('/api/cowSummary', cowSummaryRouter);

const addCalfRouter = require('./routes/addCalfRouter');
app.use('/api/calf', addCalfRouter);

const inseminationRoutes = require('./routes/inseminationRoutes');
app.use('/api/insemination', inseminationRoutes);

const ocrRoutes = require('./routes/ocrRoutes');
app.use('/api/ocr', ocrRoutes);

const farmManagerRouter = require('./routes/managerRoutes');
app.use('/api/manager', farmManagerRouter);

const adminDashStatsRouter = require('./routes/adminDashStatsRouter');
app.use('/api/admin', adminDashStatsRouter);

const porterDashStatsRouter = require('./routes/porterDashStatsRouter');
app.use('/api/porterstats', porterDashStatsRouter);

const anomaliesRouter = require("./routes/anomaliesRouter");
app.use("/api/recordstats", anomaliesRouter);

const farmerDashboard = require("./routes/FarmerDashboardRouter");
app.use("/api/farmerdash", farmerDashboard);

const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

const AnimalRouter = require('./routes/AnimalRouter');
app.use('/api/animals', AnimalRouter);

const anomalyRoutes = require('./routes/anomalyRoutes')
app.use('/api/anomalies', anomalyRoutes);

const chatRoutes = require('./routes/chatRoutes');
app.use('/api/chat', chatRoutes);

const marketRoutes = require('./routes/marketRoutes');
app.use('/api/market', marketRoutes);

const listingRoutes = require('./routes/listingRoutes');
app.use('/api/listing', listingRoutes);

const cloudinaryTest = require("./routes/cloudinaryTest");
app.use("/api/cloudinary-test", cloudinaryTest);

const requestApproval = require("./routes/sellerRequestRoutes");
app.use("/api/seller-request", requestApproval);

const Approval = require("./routes/adminRoutes");
app.use("/api/approval", Approval);

const adminMonitor = require("./routes/adminMonitorRouter");
app.use("/api/admin/monitor", adminMonitor);

const adminAlert = require("./routes/adminAlertRouter");
app.use("/api/admin/alerts", adminAlert);

const adminEvent = require("./routes/adminEventRouter");
app.use("/api/admin/events", adminEvent);

const adminAudit = require("./routes/adminAuditRouter");
app.use("/api/admin/audit", adminAudit);

const adminConfig = require("./routes/adminConfigRouter");
app.use("/api/admin/monitor/config", adminConfig);

const adminSession = require("./routes/adminSessionRouter");
app.use("/api/admin/sessions", adminSession);



// ======================================================
// MONGO CONNECTION
// ======================================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => logger.info('Connected to MongoDB'))
  .catch(err => logger.error('MongoDB connection error', err));

// ======================================================
// SOCKET.IO SETUP
// ======================================================
const { verifySocketAuth } = require("./middleware/authMiddleware");  // <-- INTEGRATED: Your auth middleware
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: ["https://maziwa-smart.vercel.app", "http://localhost:3000", "http://localhost:3001"],  // <-- ADD: Your dev URL for testing
    methods: ["GET", "POST", "DELETE", "PATCH", "PUT"],
    credentials: true,
  },
});

app.set("io", io);
io.use(verifySocketAuth);  // <-- INTEGRATED: Socket auth

// Monitor namespace for superadmin dashboard (DECLARE BEFORE USE)
const monitorNamespace = io.of("/monitor");
monitorNamespace.on("connection", (socket) => {
  logger.info(`Monitor dashboard connected: ${socket.id}`);
  broadcastOnlineList();  // <-- MOVED: Emit after monitor client connects
});

// ======================================================
// MAIN SOCKET HANDLER – RICH ONLINE TRACKING
// ======================================================
io.on("connection", async (socket) => {
  const userId = socket.user?.id?.toString();
  const role = socket.user?.role;

  if (!userId) {
    logger.warn(`Socket rejected – no userId ${socket.id}`);
    socket.disconnect(true);
    return;
  }

  const ip = socket.handshake.headers['cf-connecting-ip'] ||
    socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    socket.handshake.address || 'unknown';

  const userAgent = socket.handshake.headers['user-agent'] || 'unknown';

  logger.info(`Raw IP: ${ip}`);  // <-- ADD: Debug raw IP

  const geo = geoip.lookup(ip) || null;

  onlineUsers.set(userId, { role, ip, geo, connectedAt: new Date() });

  await Session.findOneAndUpdate(
    { userId },
    {
      role,
      socketId: socket.id,
      ip,
      userAgent,
      connectedAt: new Date(),
      updatedAt: new Date()
    },
    { upsert: true }
  );

  broadcastOnlineList();

  logger.info(`ONLINE → ${userId} (${role}) – ${ip} – Geo: ${geo ? `${geo.city}, ${geo.country}` : 'Unknown'} – Total: ${onlineUsers.size}`);

  socket.join(userId);

  await logEvent(socket, {
    userId,
    role,
    type: "socket.connect",
    metadata: { socketId: socket.id, ip, userAgent, geo }
  });

  // ADD: Handle socket errors
  socket.on("error", async (err) => {
    logger.error(`Socket error for ${userId}:`, err);
    onlineUsers.delete(userId);
    await Session.deleteOne({ socketId: socket.id });
    broadcastOnlineList();
  });

  // Chat handler
  socket.on("send_message", (data) => {
    if (data.receiver) {
      io.to(data.receiver.toString()).emit("new_message", {
        ...data,
        fromSocket: userId,
        timestamp: new Date(),
      });

      logEvent(socket, {
        userId,
        type: "chat.message.sent",
        metadata: { receiver: data.receiver, hasImage: !!data.image }
      });
    }
  });

  socket.on("disconnect", async () => {
    const userInfo = onlineUsers.get(userId);
    const ip = userInfo?.ip || 'unknown';
    const geo = userInfo?.geo || null;

    onlineUsers.delete(userId);
    await Session.deleteOne({ socketId: socket.id });
    broadcastOnlineList();

    await logEvent(socket, {
      userId,
      role,
      type: "socket.disconnect",
      metadata: { socketId: socket.id, ip, geo }
    });

    logger.warn(`OFFLINE → ${userId} – Total: ${onlineUsers.size}`);
  });
});

// ======================================================
// START SERVER
// ======================================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Rich online tracking ACTIVE`);
});