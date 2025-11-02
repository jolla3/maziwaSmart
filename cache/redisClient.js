// // cache/redisClient.js
// const Redis = require("ioredis");
// const logger = require("../utils/logger");

// let redis = null;

// if (process.env.REDIS_URL) {
//   redis = new Redis(process.env.REDIS_URL, {
//     tls: process.env.REDIS_TLS === "true" ? {} : undefined,
//     maxRetriesPerRequest: 2,
//   });

//   redis.on("connect", () => logger.info("🔗 Connected to Redis cache"));
//   redis.on("error", (err) => logger.error("❌ Redis connection error: " + err.message));
// } else {
//   logger.warn("⚠️ No REDIS_URL found. Cache layer is disabled.");
// }

// module.exports = redis;
