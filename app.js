// app.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();
require('./cron/updateCowStages');
const passport = require("./config/passport");
const { logger } = require("./utils/logger");

// ========== ADD THIS RIGHT HERE ==========
const { logEvent } = require("./utils/eventLogger");  // ← THIS IS THE KEY
// ======================================================

const app = express();

// ======================================================
// ONLINE USERS TRACKER (in-memory)
// ======================================================
const onlineUsers = new Set();
app.set("onlineUsers", onlineUsers);

// ======================================================
// GLOBAL REQUEST TRACKING MIDDLEWARE (MUST BE EARLY)
// ======================================================
app.use(async (req, res, next) => {
  const start = Date.now();

  res.on("finish", async () => {
    const duration = Date.now() - start;

    // Log ALL requests with status code
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

    // Auto-log errors (4xx and 5xx)
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
// Middleware
// ======================================================
app.use(express.json());
app.use(cors());
app.use(passport.initialize());

// ======================================================
// Routes
// ======================================================
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
app.use('/api/cows', cowSummaryRouter);

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

const anomalyRoutes = require('./routes/anomalyRoutes');
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



const adminMonitor =require("./routes/adminMonitorRouter");
app.use("/api/admin/monitor",adminMonitor)

const adminAlert = require("./routes/adminAlertRouter")
app.use("/api/admin/alerts", adminAlert );

const adminEvent =  require("./routes/adminEventRouter")
app.use("/api/admin/events",adminEvent);

const adminAduit = require("./routes/adminAuditRouter")
app.use("/api/admin/audit",adminAduit);

const adminConfig = require("./routes/adminConfigRouter")
app.use("/api/admin/monitor/config", adminConfig);

const adminSession = require("./routes/adminSessionRouter")
app.use("/api/admin/sessions", adminSession );



// ======================================================
// MongoDB Connection
// ======================================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => logger.info('✅ Connected to MongoDB'))
  .catch(err => logger.error('❌ MongoDB connection error', err));

// ======================================================
// HTTP + Socket.IO Setup
// ======================================================
const { verifySocketAuth } = require("./middleware/authMiddleware");
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: ["https://maziwa-smart.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.set("io", io);
io.use(verifySocketAuth);

// ======================================================
// Monitoring Namespace for SuperAdmin
// ======================================================
const monitorNamespace = io.of("/monitor");

monitorNamespace.on("connection", (socket) => {
  logger.info(`📡 Monitor connected: ${socket.id}`);
  socket.emit("monitor:onlineUsers", Array.from(onlineUsers));
});

// ======================================================
// Main Socket Handling + Online Tracking
// ======================================================
io.on("connection", (socket) => {
  const userId = socket.user?.id;
  const role = socket.user?.role;

  logger.info(`🟢 User connected: ${userId} (${role}) – socket ${socket.id}`);

  if (userId) {
    onlineUsers.add(userId.toString());

    // Notify monitor dashboard
    io.emit("monitor:onlineUsers", Array.from(onlineUsers));
    monitorNamespace.emit("monitor:onlineUsers", Array.from(onlineUsers));

    socket.join(userId.toString());

    // Log socket connection as event
    logEvent(null, {
      userId,
      role,
      type: "socket.connect",
      metadata: { socketId: socket.id, ip: socket.handshake.address }
    });
  }

  socket.on("send_message", (data) => {
    if (data.receiver) {
      io.to(data.receiver.toString()).emit("new_message", {
        ...data,
        fromSocket: userId,
        timestamp: new Date(),
      });

      // Optional: log chat activity
      logEvent(null, {
        userId,
        type: "chat.message.sent",
        metadata: { receiver: data.receiver, hasImage: !!data.image }
      });
    }
  });

  socket.on("disconnect", async () => {
    if (userId) {
      onlineUsers.delete(userId.toString());
      io.emit("monitor:onlineUsers", Array.from(onlineUsers));
      monitorNamespace.emit("monitor:onlineUsers", Array.from(onlineUsers));

      await logEvent(null, {
        userId,
        role,
        type: "socket.disconnect",
        metadata: { socketId: socket.id }
      });
    }

    logger.warn(`🔴 User disconnected: ${userId} (socket ${socket.id})`);
  });
});

// ======================================================
// Start Server
// ======================================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`🔥 Event tracking ACTIVE – monitor-worker will now see everything`);
});