// require("dotenv").config();
// const mongoose = require("mongoose");
// const Config = require("../models/MonitoringConfig");


// const { User  , Farmer, Listing} = require("../models/model");
// const Event = require("../models/Event");

// (async () => {
//   try {
//     if (!process.env.MONGO_URI) {
//       throw new Error("MONGO_URI is missing in your .env");
//     }

//     await mongoose.connect(process.env.MONGO_URI);
//     console.log("Connected to DB");

//     // seed-onboarding.js
//     await Listing.deleteMany();  // Delete older than 30 days
// console.log("onboarding_complete normalized");

  

//     console.log("Monitoring config seeded ✔");
//     process.exit(0);

//   } catch (err) {
//     console.error("Seed error:", err);
//     process.exit(1);
//   }
// })();


const mongoose = require("mongoose");
const Farmer = require("../models/model").Farmer;
const { generateFarmerCode } = require("../utils/farmerCodeGenerator");
require("dotenv").config();

async function migrateFarmerCodes() {
  try {
    console.log("🚀 Starting farmer code migration...");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Find all farmers without codes
    const farmersWithoutCode = await Farmer.find({
      $or: [
        { farmer_code: { $exists: false } },
        { farmer_code: null },
        { farmer_code: "" },
      ]
    });

    console.log(`📊 Found ${farmersWithoutCode.length} farmers without codes`);

    if (farmersWithoutCode.length === 0) {
      console.log("✅ All farmers already have codes!");
      process.exit(0);
    }

    let successCount = 0;
    let errorCount = 0;

    // Generate and assign codes
    for (const farmer of farmersWithoutCode) {
      try {
        const newCode = await generateFarmerCode();
        farmer.farmer_code = newCode; // Number, not string
        farmer.code_generated_at = new Date();
        farmer.code_migration_status = "auto_generated";

        await farmer.save();
        console.log(`✅ ${farmer.fullname} → ${newCode}`);
        successCount++;
      } catch (err) {
        console.error(`❌ Failed for ${farmer.fullname}: ${err.message}`);
        errorCount++;
      }
    }

    console.log("\n📊 Migration Summary:");
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`📊 Total: ${farmersWithoutCode.length}`);

    // Disconnect
    await mongoose.disconnect();
    console.log("👋 Migration complete!");

  } catch (err) {
    console.error("💥 Migration error:", err);
    process.exit(1);
  }
}

// Run migration
migrateFarmerCodes();
