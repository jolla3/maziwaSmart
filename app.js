// app.js ← REPLACE ENTIRE FILE
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
const jwt = require('jsonwebtoken');

const app = express();

// ======================================================
// TRUST PROXY + ONLINE USERS MAP
// ======================================================
app.set('trust proxy', true);

const onlineUsers = new Map(); // userId => { role, ip, geo, connectedAt, socketIds: [] }
app.set("onlineUsers", onlineUsers);

// Broadcast helper - sends to monitor namespace
const broadcastOnlineList = () => {
  try {
    const list = Array.from(onlineUsers.entries()).map(([id, info]) => ({
      userId: id,
      role: info.role,
      ip: info.ip,
      geo: info.geo,
      connectedAt: info.connectedAt
    }));

    if (monitorNamespace) {
      monitorNamespace.emit("monitor:onlineUsers", list);
    }
  } catch (err) {
    logger.error("Error broadcasting online list:", err);
  }
};

// Cleanup dead sessions every 2 min
setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const deadSessions = await Session.find({ updatedAt: { $lt: cutoff } });
    
    deadSessions.forEach(s => {
      const userId = s.userId.toString();
      const userInfo = onlineUsers.get(userId);
      if (userInfo) {
        userInfo.socketIds = userInfo.socketIds.filter(id => id !== s.socketId);
        if (userInfo.socketIds.length === 0) {
          onlineUsers.delete(userId);
        }
      }
    });
    
    await Session.deleteMany({ updatedAt: { $lt: cutoff } });
    broadcastOnlineList();
  } catch (err) {
    logger.error("Cleanup error:", err);
  }
}, 120000);

// ======================================================
// GLOBAL REQUEST LOGGER (ERRORS ONLY)
// ======================================================
app.use(async (req, res, next) => {
  const start = Date.now();

  res.on("finish", async () => {
    const duration = Date.now() - start;

    if (res.statusCode >= 400) {
      await logEvent(req, {
        userId: req.user?.id || null,
        role: req.user?.role || null,
        type: "http.error",
        metadata: {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: duration,
          userAgent: req.headers['user-agent']
        }
      });
    }
  });

  next();
});

// ======================================================
// MIDDLEWARE
// ======================================================
app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: ["https://maziwa-smart.vercel.app", "http://localhost:3000"],
  methods: ["GET", "POST", "DELETE", "PATCH", "PUT"],
  credentials: true,
}));
app.use(passport.initialize());

// ======================================================
// ROUTES
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
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: ["https://maziwa-smart.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST", "DELETE", "PATCH", "PUT"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set("io", io);

// ======================================================
// SOCKET AUTHENTICATION MIDDLEWARE
// ======================================================
const verifySocketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
    
    if (!token) {
      logger.warn(`Socket ${socket.id}: No token provided`);
      return next(new Error("Authentication required"));
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
    
    socket.user = {
      id: decoded.id || decoded._id,
      role: decoded.role,
      email: decoded.email
    };
    
    logger.info(`Socket ${socket.id} authenticated for user ${socket.user.id}`);
    next();
  } catch (err) {
    logger.error(`Socket authentication error: ${err.message}`);
    next(new Error("Invalid token"));
  }
};

io.use(verifySocketAuth);

// ======================================================
// MONITOR NAMESPACE (DECLARE FIRST)
// ======================================================
let monitorNamespace;
const monitorNamespaceObj = io.of("/monitor");

monitorNamespaceObj.on("connection", (socket) => {
  logger.info(`Monitor dashboard connected: ${socket.id}`);
  
  // Send current online users immediately
  const list = Array.from(onlineUsers.entries()).map(([id, info]) => ({
    userId: id,
    role: info.role,
    ip: info.ip,
    geo: info.geo,
    connectedAt: info.connectedAt
  }));
  
  socket.emit("monitor:onlineUsers", list);
  
  socket.on("disconnect", () => {
    logger.info(`Monitor dashboard disconnected: ${socket.id}`);
  });
});

monitorNamespace = monitorNamespaceObj;

// ======================================================
// HELPER FUNCTIONS
// ======================================================

// Get user online status
const getUserStatus = (userId) => {
  const userInfo = onlineUsers.get(userId.toString());
  if (!userInfo) {
    return { isOnline: false, lastSeen: null };
  }
  return {
    isOnline: true,
    lastSeen: userInfo.connectedAt,
    socketIds: userInfo.socketIds || []
  };
};

// Broadcast user status change
const broadcastUserStatus = (userId, isOnline) => {
  io.emit("user_status_change", {
    userId: userId.toString(),
    isOnline,
    timestamp: new Date()
  });
};

// ======================================================
// MAIN SOCKET HANDLER – COMPREHENSIVE CHAT SUPPORT
// ======================================================
io.on("connection", async (socket) => {
  const userId = socket.user?.id?.toString();
  const role = socket.user?.role;

  if (!userId) {
    logger.warn(`Socket rejected – no userId ${socket.id}`);
    socket.disconnect(true);
    return;
  }

  // Get IP and geo info
  const ip = socket.handshake.headers['cf-connecting-ip'] ||
    socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    socket.handshake.address || 'unknown';

  const userAgent = socket.handshake.headers['user-agent'] || 'unknown';

  logger.info(`Socket connected: ${socket.id} for user ${userId} from IP ${ip}`);

  const geo = geoip.lookup(ip) || null;

  // Update online users map
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, { 
      role, 
      ip, 
      geo, 
      connectedAt: new Date(),
      socketIds: new Set()
    });
  }
  
  // Add this socket to user's socket IDs
  onlineUsers.get(userId).socketIds.add(socket.id);
  onlineUsers.get(userId).connectedAt = new Date();

  // Update or create session
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

  // Join user's personal room
  socket.join(userId);

  // Broadcast online status to all
  broadcastUserStatus(userId, true);
  broadcastOnlineList();

  logger.info(`ONLINE → ${userId} (${role}) – Total online: ${onlineUsers.size}`);

  // ======================================================
  // CHAT EVENTS
  // ======================================================

  // Handle sending messages
  socket.on("send_message", async (data) => {
    try {
      const { receiverId, message, messageId, listingId } = data;
      
      if (!receiverId || !message) {
        socket.emit("error", { message: "Receiver and message are required" });
        return;
      }

      // Create message payload
      const messagePayload = {
        _id: messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sender: { id: userId, type: role },
        receiver: { id: receiverId },
        message: message.trim(),
        listing: listingId || null,
        created_at: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        isRead: false,
        delivered: false
      };

      // Emit to receiver's room
      io.to(receiverId.toString()).emit("new_message", messagePayload);

      // Confirm to sender
      socket.emit("message_sent", messagePayload);

      // Log the event
      await logEvent(socket, {
        userId,
        role,
        type: "chat.message.sent",
        metadata: { 
          receiver: receiverId, 
          messageId: messagePayload._id,
          hasImage: !!data.image 
        }
      });

      logger.info(`Message sent from ${userId} to ${receiverId}: ${messagePayload._id}`);
    } catch (err) {
      logger.error(`Error sending message:`, err);
      socket.emit("send_error", { message: "Failed to send message" });
    }
  });

  // Handle typing indicators
  socket.on("typing_start", ({ to }) => {
    if (to) {
      io.to(to.toString()).emit("typing_start", { 
        from: userId, 
        fromRole: role,
        timestamp: new Date() 
      });
    }
  });

  socket.on("typing_stop", ({ to }) => {
    if (to) {
      io.to(to.toString()).emit("typing_stop", { 
        from: userId,
        timestamp: new Date() 
      });
    }
  });

  // Handle message delivery confirmation
  socket.on("message_delivered", ({ messageId, from }) => {
    if (from) {
      io.to(from.toString()).emit("message_delivered", {
        messageId,
        deliveredTo: userId,
        timestamp: new Date()
      });
    }
  });

  // Handle message read confirmation
  socket.on("message_read", ({ messageId, from }) => {
    if (from) {
      io.to(from.toString()).emit("message_read", {
        messageId,
        readBy: userId,
        timestamp: new Date()
      });
    }
  });

  // Handle user status requests
  socket.on("get_user_status", ({ userId: targetUserId }) => {
    const status = getUserStatus(targetUserId);
    socket.emit("user_status", {
      userId: targetUserId,
      ...status
    });
  });

  // Handle getting online users list
  socket.on("get_online_users", () => {
    const list = Array.from(onlineUsers.entries()).map(([id, info]) => ({
      userId: id,
      role: info.role,
      connectedAt: info.connectedAt
    }));
    socket.emit("online_users_list", { users: list });
  });

  // ======================================================
  // GENERIC EVENTS
  // ======================================================

  socket.on("error", async (err) => {
    logger.error(`Socket error for ${userId}:`, err);
  });

  // Handle disconnection
  socket.on("disconnect", async (reason) => {
    logger.info(`Socket disconnect: ${socket.id} for user ${userId}, reason: ${reason}`);

    // Remove this socket from user's socket IDs
    const userInfo = onlineUsers.get(userId);
    if (userInfo) {
      userInfo.socketIds.delete(socket.id);
      
      // If user has no more sockets, mark as offline
      if (userInfo.socketIds.size === 0) {
        onlineUsers.delete(userId);
        broadcastUserStatus(userId, false);
        await Session.deleteOne({ socketId: socket.id });
      } else {
        // Update session with another active socket
        const remainingSocketId = Array.from(userInfo.socketIds)[0];
        await Session.findOneAndUpdate(
          { userId },
          { socketId: remainingSocketId, updatedAt: new Date() }
        );
      }
    } else {
      await Session.deleteOne({ socketId: socket.id });
    }

    broadcastOnlineList();

    // Log logout event
    await logEvent(socket, {
      userId,
      role,
      type: "user.logout",
      metadata: { socketId: socket.id, reason }
    });

    logger.warn(`OFFLINE → ${userId} – Total: ${onlineUsers.size}`);
  });

  // Handle explicit logout
  socket.on("logout", async () => {
    logger.info(`User ${userId} logged out explicitly`);
    
    onlineUsers.delete(userId);
    await Session.deleteOne({ socketId: socket.id });
    
    broadcastUserStatus(userId, false);
    broadcastOnlineList();
    
    socket.disconnect();
  });

  // Handle reconnection
  socket.on("reconnect", (attemptNumber) => {
    logger.info(`Socket ${socket.id} reconnected after ${attemptNumber} attempts`);
  });
});

// ======================================================
// START SERVER
// ======================================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`✅ Rich online tracking ACTIVE`);
  logger.info(`✅ Chat messaging ACTIVE`);
  logger.info(`✅ Typing indicators ACTIVE`);
    })