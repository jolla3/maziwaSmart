const { Cow, CowMilkRecord } = require("../models/model");
// const moment = require('moment')
const moment = require('moment-timezone'); // Add this if not already required

// // POST /api/farmer/cows
// exports.createCow = async (req, res) => {
//   try {
//     const { cow_name, breed_id, gender, birth_date, litres_per_day, mother_id } = req.body;
//     const farmer_id = req.user._id;
//     const farmer_code = req.user.code;

//     const newCow = new Cow({
//       cow_name,
//       farmer: farmer_id,
//       breed_id,
//       gender,
//       birth_date,
//       litres_per_day,
//       farmer_id,
//       farmer_code,
//       is_calf:false
//     });

//     await newCow.save();

//     res.status(201).json({
//       message: "✅ Cow registered successfully",
//       cow: newCow
//     });
//   } catch (error) {
//     console.error("❌ Cow creation error:", error);
//     res.status(500).json({ message: "Failed to register cow", error: error.message });
//   }
// };


// // GET /api/farmer/cows
// exports.getMyCows = async (req, res) => {
//   try {
//     const farmer_code = req.user.code;
//     const { gender, stage } = req.query; // ✅ Destructure gender and stage from query parameters

//     // ✅ Build a dynamic filter object
//     const filter = { farmer_code };

//     if (gender) {
//       filter.gender = gender;
//     }

//     if (stage) {
//       // Check if 'stage' is an array. The frontend sends it as such.
//       if (Array.isArray(stage)) {
//         filter.stage = { $in: stage }; // ✅ Use $in operator for arrays
//       } else {
//         filter.stage = stage;
//       }
//     }

//     const cows = await Cow.find(filter) // ✅ Use the dynamic filter
//       .populate('breed_id', 'breed_name')
//       .populate('mother_id', 'cow_name')
//       .populate({
//         path: 'offspring_ids',
//         select: 'cow_name birth_date'
//       });

//    res.status(200).json({ cows });
//   } catch (error) {
//     console.error("❌ Error fetching cows:", error);
//     res.status(500).json({ message: "Failed to fetch cows", error: error.message });
//   }
// };
// // PUT /api/farmer/cows/:id
// exports.updateCow = async (req, res) => {
//   try {
//     const farmer_code = req.user.code; // from token
//     const cowId = req.params.id; // from URL
//     const updateData = req.body; // data to update

//     // Only allow update if this cow belongs to the logged-in farmer
//     const cow = await Cow.findOneAndUpdate(
//       { _id: cowId, farmer_code },
//       updateData,
//       { new: true }
//     );

//     if (!cow) {
//       return res.status(404).json({ message: "Cow not found or unauthorized" });
//     }

//     res.status(200).json({
//       message: "Cow updated successfully",
//       cow,
//     });
//   } catch (error) {
//     console.error("Update error:", error);
//     res.status(500).json({ message: "Failed to update cow", error: error.message });
//   }
// }

// // DELETE /api/farmer/cows/:id
// exports.deleteCow = async (req, res) => {
//   try {
//     const farmer_code = req.user.code;
//     const cowId = req.params.id;

//     const deleted = await Cow.findOneAndDelete({ _id: cowId, farmer_code });

//     if (!deleted) {
//       return res.status(404).json({ message: "Cow not found or unauthorized" });
//     }

//     res.status(200).json({ message: "Cow deleted successfully" });
//   } catch (error) {
//     console.error("Delete error:", error);
//     res.status(500).json({ message: "Failed to delete cow", error: error.message });
//   }
// };


// add cow litres by id


// Add cow litres (creates a CowMilkRecord)

exports.addCowLitres = async (req, res) => {
  try {
    const { id } = req.params; // cow ID
    const { litres } = req.body;

    if (!litres || isNaN(litres) || litres <= 0) {
      return res.status(400).json({ message: "❌ Please provide valid litres" });
    }

    // Get farmer info from logged-in user
    const farmerId = req.user.id;           // MongoDB _id of farmer
    const farmerCode = req.user.code;       // Unique farmer code

    if (!farmerId || !farmerCode) {
      return res.status(401).json({ message: "❌ Unauthorized: farmer info missing" });
    }

    // Use consistent EAT timezone for all time ops
    const now = moment.tz("Africa/Nairobi");
    const currentHour = now.hour();
    let time_slot = "";
    if (currentHour >= 4 && currentHour < 8) time_slot = "early_morning";
    else if (currentHour >= 8 && currentHour < 11) time_slot = "morning";
    else if (currentHour >= 11 && currentHour < 14) time_slot = "midday";
    else if (currentHour >= 14 && currentHour < 17) time_slot = "afternoon";
    else if (currentHour >= 17 && currentHour < 20) time_slot = "evening";
    else time_slot = "night";

    // Ensure cow exists and belongs to this farmer
    const cow = await Cow.findOne({ _id: id, farmer_code: farmerCode });
    if (!cow) {
      return res.status(404).json({ message: "🐄 Cow not found or unauthorized" });
    }

    // Prevent duplicate milk entry for the same cow+slot+day (TZ-aware)
    const todayStart = now.clone().startOf("day").toDate();
    const todayEnd = now.clone().endOf("day").toDate();

    const existingRecord = await CowMilkRecord.findOne({
      animal_id: cow._id,
      farmer: farmerId,          // Mongo _id of farmer for bulletproof
      time_slot,
      collection_date: { $gte: todayStart, $lte: todayEnd },
    });

    if (existingRecord) {
      return res.status(400).json({
        message: `⛔ Milk already recorded for the ${time_slot} slot today`,
      });
    }

    // Create milk record (collection_date as UTC timestamp)
    const record = await CowMilkRecord.create({
      animal_id: cow._id,
      farmer: farmerId,         // store farmer _id
      farmer_code: farmerCode,  // also store farmer code for reference
      cow_name: cow.cow_name,
      cow_code: cow.cow_code,
      litres,
      time_slot,
      collection_date: now.toDate(), // UTC equivalent
    });

    return res.status(200).json({
      message: `✅ Milk recorded successfully for ${time_slot} slot`,
      cow_id: cow._id,
      cow_name: cow.cow_name,
      litres: record.litres,
      time_slot: record.time_slot,
      recorded_at: now.format("YYYY-MM-DD HH:mm:ss"), // Local EAT format for response
    });

  } catch (err) {
    console.error("Error in addCowLitres:", err);
    return res.status(500).json({ message: "❌ Failed to record milk", error: err.message });
  }
};

// Get cow daily summary (group by date)
exports.getCowLitresSummary = async (req, res) => {
  try {
    const farmer_code = Number(req.user.code);
    const { id } = req.params;

    // Confirm ownership
    const cow = await Cow.findOne({ _id: id, farmer_code });
    if (!cow) {
      return res.status(404).json({ message: "Cow not found or unauthorized" });
    }

    // Fetch all milk records for that cow (TZ-aware, but since stored UTC, fetch all and group in EAT)
    const records = await CowMilkRecord.find(
      { animal_id: cow._id, farmer_code },
      { litres: 1, time_slot: 1, collection_date: 1 }
    ).sort({ collection_date: -1 });

    // Group data by EAT date
    const summary = {};
    records.forEach(r => {
      const eatDate = moment(r.collection_date).tz("Africa/Nairobi").format("YYYY-MM-DD");
      if (!summary[eatDate]) summary[eatDate] = [];

      summary[eatDate].push({
        time_slot: r.time_slot,
        litres: r.litres
      });
    });

    // Sort by date (latest first)
    const sortedSummary = Object.entries(summary)
      .sort(([dateA], [dateB]) => new Date(dateB) - new Date(dateA))
      .map(([date, slots]) => ({ date, slots }));

    res.status(200).json({
      cow_name: cow.cow_name,
      cow_id: cow._id,
      summary: sortedSummary
    });
  } catch (err) {
    console.error("Error fetching litres summary:", err);
    res.status(500).json({
      message: "Error fetching litres summary",
      error: err.message
    });
  }
};


// Get last 7 days for a cow
exports.getCowLast7Days = async (req, res) => {
  try {
    const farmer_code = Number(req.user.code);
    const { id } = req.params;

    const cow = await Cow.findOne({ _id: id, farmer_code });
    if (!cow) return res.status(404).json({ message: "Cow not found or unauthorized" });

    const now = moment.tz("Africa/Nairobi");
    const start = now.clone().subtract(6, "days").startOf("day").toDate();
    const records = await CowMilkRecord.find({
      animal_id: cow._id,
      farmer_code,
      collection_date: { $gte: start }
    }).sort({ collection_date: 1 });

    let total = 0;
    const summary = {};

    records.forEach(r => {
      const date = moment(r.collection_date).tz("Africa/Nairobi").format("YYYY-MM-DD");
      if (!summary[date]) summary[date] = [];
      summary[date].push({ time_slot: r.time_slot, litres: r.litres });
      total += r.litres;
    });

    const weeklyData = Object.entries(summary).map(([date, slots]) => ({
      date,
      day: moment.tz(date, "Africa/Nairobi").format("dddd"),
      slots,
      total_litres: slots.reduce((sum, s) => sum + s.litres, 0)
    }));

    res.status(200).json({
      cow_name: cow.cow_name,
      cow_id: cow._id,
      weekly_summary: weeklyData,
      total_litres_this_week: total
    });
  } catch (err) {
    console.error("Weekly trend error:", err);
    res.status(500).json({ message: "Failed to fetch weekly trend", error: err.message });
  }
};

// Get cow monthly total (group by week in current month)
exports.getCowMonthlyTotal = async (req, res) => {
  try {
    const farmer_code = Number(req.user.code);
    const { id } = req.params;

    const cow = await Cow.findOne({ _id: id, farmer_code });
    if (!cow) return res.status(404).json({ message: "Cow not found" });

    const now = moment.tz("Africa/Nairobi");
    const start = now.clone().startOf("month").toDate();
    const end = now.clone().endOf("month").toDate();

    const records = await CowMilkRecord.find({
      animal_id: cow._id,
      farmer_code,
      collection_date: { $gte: start, $lte: end }
    }).sort({ collection_date: 1 });

    const weeks = {};

    records.forEach(r => {
      const date = moment(r.collection_date).tz("Africa/Nairobi");
      const weekNum = `Week ${Math.ceil(date.date() / 7)}`;
      if (!weeks[weekNum]) weeks[weekNum] = { week: weekNum, slots: {} };

      if (!weeks[weekNum].slots[r.time_slot]) weeks[weekNum].slots[r.time_slot] = 0;
      weeks[weekNum].slots[r.time_slot] += r.litres;
    });

    const monthlySummary = Object.values(weeks).map(week => ({
      week: week.week,
      slots: Object.entries(week.slots).map(([slot, litres]) => ({
        time_slot: slot,
        litres
      })),
      total_litres: Object.values(week.slots).reduce((a, b) => a + b, 0)
    }));

    res.status(200).json({
      cow_name: cow.cow_name,
      cow_id: cow._id,
      monthly_summary: monthlySummary
    });
  } catch (err) {
    console.error("Monthly summary error:", err);
    res.status(500).json({ message: "Failed to fetch monthly summary", error: err.message });
  }
};

// Get weekly trend (aggregate litres by weekday)
exports.getCowWeeklyTrend = async (req, res) => {
  try {
    const farmer_code = Number(req.user.code);
    const { id } = req.params;

    const cow = await Cow.findOne({ _id: id, farmer_code });
    if (!cow) return res.status(404).json({ message: "Cow not found" });

    const records = await CowMilkRecord.find({ animal_id: cow._id, farmer_code });

    const weekdayMap = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const trend = {};
    const dayCounts = {};

    records.forEach(r => {
      const eatDate = moment(r.collection_date).tz("Africa/Nairobi");
      const dayIndex = eatDate.day();
      const day = weekdayMap[dayIndex];
      if (!trend[day]) {
        trend[day] = {};
        dayCounts[day] = new Set(); // Track unique dates for average
      }
      dayCounts[day].add(eatDate.format("YYYY-MM-DD")); // Unique days
      if (!trend[day][r.time_slot]) trend[day][r.time_slot] = 0;
      trend[day][r.time_slot] += r.litres;
    });

    const formattedTrend = Object.entries(trend).map(([day, slots]) => {
      const slotTotals = Object.entries(slots).map(([time_slot, litres]) => ({ time_slot, litres }));
      const total_litres = Object.values(slots).reduce((a, b) => a + b, 0);
      const dayCount = dayCounts[day] ? dayCounts[day].size : 0;
      const avg_litres = dayCount > 0 ? (total_litres / dayCount) : 0;
      return {
        day,
        slots: slotTotals,
        total_litres,
        avg_litres: parseFloat(avg_litres.toFixed(2)), // Realistic average per day
        day_count: dayCount
      };
    });

    res.status(200).json({
      cow_name: cow.cow_name,
      cow_id: cow._id,
      weekly_trend: formattedTrend
    });
  } catch (err) {
    console.error("Weekly trend fetch error:", err);
    res.status(500).json({ message: "Failed to fetch weekly trend", error: err.message });
  }
};