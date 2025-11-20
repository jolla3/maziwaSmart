const Event = require("../models/Event");
const Alert = require("../models/Alert");
const Listing = require("../models/ListingsAudit");

exports.getOnlineUsers = async (req, res) => {
  try {
    const onlineUsers = req.app.get("onlineUsers");
    res.json({ count: onlineUsers.size, users: Array.from(onlineUsers) });
  } catch (err) {
    res.status(500).json({ error: "Failed to load online users" });
  }
};

exports.getMonitorStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));

    const totalEventsToday = await Event.countDocuments({ createdAt: { $gte: startOfDay } });

    const failedLoginsPastHour = await Event.countDocuments({
      type: "auth.login.fail",
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
    });

    const newAlerts = await Alert.countDocuments({
      status: "open",
      createdAt: { $gte: startOfDay }
    });

    const suspiciousListings = await Listing.countDocuments({
      flagged: true
    });

    res.json({
      totalEventsToday,
      failedLoginsPastHour,
      newAlerts,
      suspiciousListings
    });

  } catch (err) {
    res.status(500).json({ error: "Failed to load monitoring stats" });
  }
};
