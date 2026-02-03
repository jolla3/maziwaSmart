// controllers/adminSessionController.js  ← REPLACE THIS FILE ENTIRELY
const Session = require("../models/Session");

exports.getSessions = async (req, res) => {
  try {
    const sessions = await Session.find({}).sort({ connectedAt: -1 }).lean();
    res.json(sessions);
  } catch (err) {
    logger.error("getSessions error:", err);
    res.status(500).json({ error: "Failed to load sessions" });
  }
};

exports.killSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const io = req.app.get("io");
    const socket = io.sockets.sockets.get(session.socketId);

    if (socket) {
      socket.emit("force:logout", { message: "Session terminated by admin" });
      socket.disconnect(true);
    }

    await Session.deleteOne({ _id: req.params.id });

    res.json({ success: true });
  } catch (err) {
    logger.error("killSession error:", err);
    res.status(500).json({ error: "Failed to kill session" });
  }
};
const Event = require("../models/Event");

exports.getEvents = async (req, res) => {
  try {
    const { type, userId, ip, from, to, page = 1 } = req.query;

    const filter = {};
    if (type) filter.type = type;
    if (userId) filter.userId = userId;
    if (ip) filter.ip = ip;
    if (from) filter.createdAt = { $gte: new Date(from) };
    if (to) filter.createdAt = { ...(filter.createdAt || {}), $lte: new Date(to) };

    const perPage = 50;

    const events = await Event.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage);

    res.json(events);
  } catch {
    res.status(500).json({ error: "Failed to load event logs" });
  }
};

exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    res.json(event);
  } catch {
    res.status(500).json({ error: "Failed to load event" });
  }
};
const Alert = require("../models/Alert");

exports.getAlerts = async (req, res) => {
  try {
    const { status = "open", page = 1, limit = 50 } = req.query;
    const alerts = await Alert.find({ status })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await Alert.countDocuments({ status });
    res.json({ alerts, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error("getAlerts error:", err);
    res.status(500).json({ error: "Failed to load alerts" });
  }
};

exports.updateAlertStatus = async (req, res) => {
  try {
    const { action } = req.body; // reviewing | close | escalate
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    if (action === "reviewing") alert.status = "reviewing";
    if (action === "close") {
      alert.status = "closed";
      alert.resolvedAt = new Date();
    }
    if (action === "escalate") alert.severity = "high";

    await alert.save();
    res.json({ success: true, alert });
  } catch (err) {
    logger.error("updateAlertStatus error:", err);
    res.status(500).json({ error: "Failed to update alert" });
  }
};

exports.deleteAlert = async (req, res) => {
  try {
    await Alert.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete alert" });
  }
};
exports.getAlertById = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: "Failed to load alert" });
  }
};