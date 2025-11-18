// app.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
require("dotenv").config();
require("./cron/updateCowStages");
const passport = require("./config/passport");
const { logger } = require("./utils/logger");

const app = express();

// ======================================================
// Middleware
// ======================================================
app.use(express.json());

// *************** FIXED CORS (THE REAL FIX) ***************
app.use(
  cors({
    origin: [
      "https://maziwa-smart.vercel.app",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Fix for Render OPTIONS 405
app.options("*", cors());

// Passport
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

// ======================================================
// MongoDB Connection
// ======================================================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => logger.info("Connected to MongoDB"))
  .catch((err) => logger.error("MongoDB error", err));

// ======================================================
// HTTP + Socket.IO Setup
// ======================================================
const { verifySocketAuth } = require("./middleware/authMiddleware");
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: [
      "https://maziwa-smart.vercel.app",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// expose socket instance to routes
app.set("io", io);

// track online users
const onlineUsers = new Set();
app.set("onlineUsers", onlineUsers);

// authenticate sockets
io.use(verifySocketAuth);

// Monitoring Namespace
const monitorNamespace = io.of("/monitor");

monitorNamespace.on("connection", (socket) => {
  logger.info(`Monitor connected: ${socket.id}`);
  socket.emit("monitor:onlineUsers", Array.from(onlineUsers));
});

// Main socket logic
io.on("connection", (socket) => {
  const userId = socket.user?.id;

  if (userId) {
    onlineUsers.add(userId.toString());
    io.emit("monitor:onlineUsers", Array.from(onlineUsers));
    monitorNamespace.emit("monitor:onlineUsers", Array.from(onlineUsers));
    socket.join(userId.toString());
  }

  socket.on("send_message", (data) => {
    if (data.receiver) {
      io.to(data.receiver.toString()).emit("new_message", {
        ...data,
        fromSocket: userId,
        timestamp: new Date(),
      });
    }
  });

  socket.on("disconnect", () => {
    if (userId) {
      onlineUsers.delete(userId.toString());
      io.emit("monitor:onlineUsers", Array.from(onlineUsers));
      monitorNamespace.emit("monitor:onlineUsers", Array.from(onlineUsers));
    }
  });
});

// ======================================================
// Start Server
// ======================================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
