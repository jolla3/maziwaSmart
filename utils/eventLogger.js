// utils/eventLogger.js
const Event = require("../models/Event");
const geoip = require("geoip-lite"); // npm install geoip-lite   (free, works offline after first download)

const logEvent = async (req = null, { userId, role, type, metadata = {} }) => {
  try {
    const getClientIp = (req) => {
  // Cloudflare, Render, Vercel, Nginx all use this
  if (req.headers['cf-connecting-ip']) return req.headers['cf-connecting-ip'];
  if (req.headers['x-forwarded-for']) {
    return req.headers['x-forwarded-for'].split(',')[0].trim();
  }
  if (req.headers['x-real-ip']) return req.headers['x-real-ip'];
  return req.ip || req.connection?.remoteAddress || "unknown";
};

const ip = getClientIp(req);

    const userAgent = req?.headers['user-agent'] || "unknown";

    // Optional: add geo data (country, city) - super useful for fraud detection
    const geo = geoip.lookup(ip) || null;

    await Event.create({
      userId: userId || null,
      role: role || (req?.user?.role) || null,
      type,
      ip,
      userAgent,
      metadata: {
        ...metadata,
        geo: geo ? { country: geo.country, city: geo.city } : null,
        path: req?.originalUrl || null,
        method: req?.method || null
      }
    });
  } catch (err) {
    // Never crash the main app because of logging
    console.error("Event logging failed:", err);
  }
};

module.exports = { logEvent };