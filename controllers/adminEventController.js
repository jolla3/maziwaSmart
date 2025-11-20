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
