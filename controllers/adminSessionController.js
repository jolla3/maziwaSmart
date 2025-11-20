const Session = require("../models/Session");

exports.getSessions = async (req, res) => {
  try {
    const sessions = await Session.find().sort({ connectedAt: -1 });
    res.json(sessions);
  } catch {
    res.status(500).json({ error: "Failed to load sessions" });
  }
};

exports.killSession = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const io = req.app.get("io");
    if (io) io.sockets.sockets.get(session.socketId)?.disconnect(true);

    await session.deleteOne();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to kill session" });
  }
};
