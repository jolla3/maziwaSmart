const moment = require('moment');
const { Cow } = require('../models/model'); // Adjust if needed

exports.getFarmerDailySummary = async (req, res) => {
  try {
    const farmerCode = Number(req.user.code); // farmer_code is Number in schema
    const today = moment().startOf("day");
    const start = today.toDate();
    const end = moment(today).endOf("day").toDate();

    // Check if farmer has cows
    const cows = await Cow.find({ farmer_code: farmerCode }).select("_id cow_name").lean();
    if (!cows.length) {
      return res.status(200).json({
        message: "🐄 You haven't added any cows yet.",
        date: today.format("dddd, MMMM Do YYYY"),
        cows: [],
        total_litres_today: 0
      });
    }

    // Aggregate CowMilkRecords for today
    const agg = await CowMilkRecord.aggregate([
      {
        $match: {
          farmer_code: farmerCode,
          collection_date: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { cow: "$animal_id", time_slot: "$time_slot" },
          totalLitres: { $sum: "$litres" }
        }
      }
    ]);

    // Transform aggregation into lookup structure
    const cowMap = {};
    for (const entry of agg) {
      const cowId = entry._id.cow.toString();
      const slot = entry._id.time_slot;
      if (!cowMap[cowId]) {
        cowMap[cowId] = { total: 0, slots: { morning: 0, midmorning: 0, afternoon: 0, evening: 0 } };
      }
      cowMap[cowId].total += entry.totalLitres;
      if (cowMap[cowId].slots.hasOwnProperty(slot)) {
        cowMap[cowId].slots[slot] += entry.totalLitres;
      }
    }

    // Build cow summaries
    const cowSummaries = cows.map(cow => {
      const stats = cowMap[cow._id.toString()] || {
        total: 0,
        slots: { morning: 0, midmorning: 0, afternoon: 0, evening: 0 }
      };
      return {
        cow_name: cow.cow_name,
        litres_collected: stats.total,
        timeslots: stats.slots
      };
    });

    const totalLitresToday = cowSummaries.reduce((sum, c) => sum + c.litres_collected, 0);

    return res.status(200).json({
      message: "🥛 Here's your milk summary for today",
      date: today.format("dddd, MMMM Do YYYY"),
      cows: cowSummaries,
      total_litres_today: totalLitresToday
    });

  } catch (error) {
    console.error("❌ Error in getFarmerDailySummary:", error);
    return res.status(500).json({
      message: "Failed to fetch milk summary",
      error: error.message
    });
  }
};



exports.getFarmerMilkRecords = async (req, res) => {
  try {
    const farmerCode = String(req.user.code);
    const cows = await Cow.find({ farmer_code: farmerCode });

    if (!cows.length) {
      return res.status(200).json({
        message: "🐄 No cows found for this farmer.",
        records: []
      });
    }

    // Format records for frontend
    const records = [];
    for (const cow of cows) {
      for (const rec of cow.litres_records || []) {
        records.push({
          cow_name: cow.cow_name,
          litres: rec.litres,
          time_slot: rec.time_slot,
          date: rec.date
        });
      }
    }

    return res.status(200).json({
      message: "✅ All milk records fetched successfully.",
      records
    });

  } catch (err) {
    console.error("❌ Error in getFarmerMilkRecords:", err);
    res.status(500).json({
      message: "❌ Failed to fetch records.",
      error: err.message
    });
  }
};

// const cleanInvalidLitresRecords = async () => {
//   try {
//     const cows = await Cow.find();

//     for (const cow of cows) {
//       const originalLength = cow.litres_records.length;

//       // Filter out invalid records (missing time_slot)
//       cow.litres_records = cow.litres_records.filter(record => record.time_slot);

//       const newLength = cow.litres_records.length;

//       if (originalLength !== newLength) {
//         await cow.save(); // save only if changes were made
//         console.log(`✅ Cleaned ${originalLength - newLength} invalid record(s) for Cow: ${cow._id}`);
//       }
//     }

//     console.log("🎉 Cleanup complete. All invalid litres_records removed.");
//   } catch (error) {
//     console.error("❌ Error cleaning records:", error);
//   }
// };

// cleanInvalidLitresRecords();
