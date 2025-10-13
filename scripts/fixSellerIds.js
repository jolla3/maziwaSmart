require("dotenv").config();
const mongoose = require("mongoose");
const {Listing} = require("../models/model"); // adjust path if needed

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://myApp:3H7K5ZoxRUXF5x00@cluster0.ydiy3ec.mongodb.net/maziwaSmart?retryWrites=true&w=majority";

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const listings = await Listing.find({ seller: { $type: "string" } });
    console.log(`Found ${listings.length} listings with string seller IDs.`);

    for (const doc of listings) {
      try {
        const objId = new mongoose.Types.ObjectId(doc.seller);
        await Listing.updateOne({ _id: doc._id }, { $set: { seller: objId } });
        console.log(`✅ Updated listing ${doc._id}`);
      } catch (err) {
        console.log(`⚠️ Skipped listing ${doc._id}: invalid ObjectId (${doc.seller})`);
      }
    }

    console.log("🎉 Done! All string seller IDs converted to ObjectIds.");
    await mongoose.disconnect();
  } catch (err) {
    console.error("❌ Error during conversion:", err);
    process.exit(1);
  }
})();
