// seed/superAdminSeeder.js
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { User } = require("../models/model");

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const existingSuper = await User.findOne({ role: "superadmin" });
    if (existingSuper) {
      console.log("⚠️ SuperAdmin already exists ->", existingSuper.email);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD, 10);

    const superAdmin = new User({
      username: process.env.SUPERADMIN_USERNAME || "superadmin",
      email: process.env.SUPERADMIN_EMAIL,
      password: hashedPassword,
      role: "superadmin",
    });

    await superAdmin.save();
    console.log("✅ SuperAdmin created:", superAdmin.email);

    process.exit(0);
  } catch (err) {
    console.error("❌ Seeder error:", err);
    process.exit(1);
  }
})();
