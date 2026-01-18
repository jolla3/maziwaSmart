// utils/eventLogger.js  ← REPLACE ENTIRE FILE
const Event = require("../models/Event");
const geoip = require("geoip-lite");

const logEvent = async (reqOrSocket = null, { userId, role, type, metadata = {} }) => {
  try {
    let ip = "unknown";
    let userAgent = "unknown";

    if (reqOrSocket) {
      if (reqOrSocket.handshake) { // Socket
        const socket = reqOrSocket;
        ip = socket.handshake.headers['cf-connecting-ip'] ||
             socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             socket.handshake.address || "unknown";
        userAgent = socket.handshake.headers['user-agent'] || "unknown";
      } else { // Req
        const req = reqOrSocket;
        ip = req.headers['cf-connecting-ip'] ||
             req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.headers['x-real-ip'] ||
             req.ip ||
             req.connection?.remoteAddress ||
             "unknown";
        userAgent = req.headers['user-agent'] || "unknown";
      }
    }

    const geo = geoip.lookup(ip) || null;

    await Event.create({
      userId: userId || null,
      role: role || (reqOrSocket?.user?.role) || null,
      type,
      ip,
      userAgent,
      metadata: {
        ...metadata,
        geo: geo ? { country: geo.country, city: geo.city } : null,
        path: reqOrSocket?.originalUrl || null,
        method: reqOrSocket?.method || null
      }
    });
  } catch (err) {
    logger.error("Event logging failed:", err);
  }
};

module.exports = { logEvent };