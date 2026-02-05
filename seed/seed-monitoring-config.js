require("dotenv").config();
const mongoose = require("mongoose");
const Config = require("../models/MonitoringConfig");


const { User  , Farmer} = require("../models/model");

(async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing in your .env");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    // seed-onboarding.js
await User.updateMany(
  { password: { $exists: true, $ne: null } },
  { $set: { onboarding_complete: true } }
);

await Farmer.updateMany(
  { password: { $exists: true, $ne: null } },
  { $set: { onboarding_complete: true } }
);

console.log("onboarding_complete normalized");

  

    console.log("Monitoring config seeded ✔");
    process.exit(0);

  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  }
})();
