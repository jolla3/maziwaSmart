// controllers/adminMonitorController.js  ← REPLACE THIS FILE ENTIRELY
const Session = require("../models/Session");
const Event = require("../models/Event");
const Alert = require("../models/Alert");
const Listing = require("../models/ListingsAudit");

exports.getOnlineUsers = async (req, res) => {
  try {
    const sessions = await Session.find({}).sort({ connectedAt: -1 }).lean();

    const richUsers = sessions.map(s => ({
      userId: s.userId.toString(),
      role: s.role || "unknown",
      ip: s.ip || "unknown",
      userAgent: s.userAgent || "unknown",
      connectedAt: s.connectedAt,
      socketId: s.socketId
    }));

    res.json({
      count: richUsers.length,
      users: richUsers
    });
  } catch (err) {
    logger.error("getOnlineUsers error:", err);
    res.status(500).json({ error: "Failed to load online users" });
  }
};

exports.getMonitorStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));

    const [onlineCount, totalEventsToday, failedLoginsPastHour, openAlertsToday, suspiciousListings] = await Promise.all([
      Session.countDocuments(),
      Event.countDocuments({ createdAt: { $gte: startOfDay } }),
      Event.countDocuments({
        type: "auth.login.fail",
        createdAt: { $gte: new Date(Date.now() - 3600000) }
      }),
      Alert.countDocuments({ status: "open", createdAt: { $gte: startOfDay } }),
      Listing.countDocuments({ flagged: true })
    ]);

    res.json({
      onlineCount,
      totalEventsToday,
      failedLoginsPastHour,
      openAlertsToday,
      suspiciousListings
    });
  } catch (err) {
    logger.error("getMonitorStats error:", err);
    res.status(500).json({ error: "Failed to load stats" });
  }
};