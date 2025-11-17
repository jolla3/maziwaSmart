const Event = require("../models/Event");

exports.logEvent = async (type, userId, meta = {}, ip = null) => {
  try {
    await Event.create({
      type,
      userId,
      metadata: meta,
      ip
    });
  } catch (err) {
    console.error("Event log error:", err);
  }
};
