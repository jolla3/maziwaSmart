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