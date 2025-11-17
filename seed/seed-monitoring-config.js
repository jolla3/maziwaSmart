require("dotenv").config();
const mongoose = require("mongoose");
const Config = require("../models/MonitoringConfig");

(async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing in your .env");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const defaults = [
      { key: "failedLogin.window.minutes", value: 15 },
      { key: "failedLogin.threshold", value: 20 },
      { key: "spamListing.window.minutes", value: 10 },
      { key: "spamListing.threshold", value: 5 },
      { key: "spamListing.similarity.threshold", value: 0.8 },
      { key: "worker.loop.ms", value: 60000 },
      { key: "alert.dedupe.minutes", value: 10 }
    ];

    for (const cfg of defaults) {
      await Config.updateOne(
        { key: cfg.key },
        { $setOnInsert: cfg },
        { upsert: true }
      );
    }

    console.log("Monitoring config seeded ✔");
    process.exit(0);

  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  }
})();
