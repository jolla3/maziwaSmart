const { Cow, CowMilkRecord } = require("../models/model");
const moment = require('moment')

// POST /api/farmer/cows
exports.createCow = async (req, res) => {
  try {
    const { cow_name, breed_id, gender, birth_date, litres_per_day, mother_id } = req.body;
    const farmer_id = req.user._id;
    const farmer_code = req.user.code;

    const newCow = new Cow({
      cow_name,
      farmer: farmer_id,
      breed_id,
      gender,
      birth_date,
      litres_per_day,
      farmer_id,
      farmer_code,
      is_calf:false
    });

    await newCow.save();

    res.status(201).json({
      message: "✅ Cow registered successfully",
      cow: newCow
    });
  } catch (error) {
    console.error("❌ Cow creation error:", error);
    res.status(500).json({ message: "Failed to register cow", error: error.message });
  }
};


// GET /api/farmer/cows
exports.getMyCows = async (req, res) => {
  try {
    const farmer_code = req.user.code;
    const { gender, stage } = req.query; // ✅ Destructure gender and stage from query parameters

    // ✅ Build a dynamic filter object
    const filter = { farmer_code };

    if (gender) {
      filter.gender = gender;
    }

    if (stage) {
      // Check if 'stage' is an array. The frontend sends it as such.
      if (Array.isArray(stage)) {
        filter.stage = { $in: stage }; // ✅ Use $in operator for arrays
      } else {
        filter.stage = stage;
      }
    }

    const cows = await Cow.find(filter) // ✅ Use the dynamic filter
      .populate('breed_id', 'breed_name')
      .populate('mother_id', 'cow_name')
      .populate({
        path: 'offspring_ids',
        select: 'cow_name birth_date'
      });

   res.status(200).json({ cows });
  } catch (error) {
    console.error("❌ Error fetching cows:", error);
    res.status(500).json({ message: "Failed to fetch cows", error: error.message });
  }
};
// PUT /api/farmer/cows/:id
exports.updateCow = async (req, res) => {
  try {
    const farmer_code = req.user.code; // from token
    const cowId = req.params.id; // from URL
    const updateData = req.body; // data to update

    // Only allow update if this cow belongs to the logged-in farmer
    const cow = await Cow.findOneAndUpdate(
      { _id: cowId, farmer_code },
      updateData,
      { new: true }
    );

    if (!cow) {
      return res.status(404).json({ message: "Cow not found or unauthorized" });
    }

    res.status(200).json({
      message: "Cow updated successfully",
      cow,
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ message: "Failed to update cow", error: error.message });
  }
}

// DELETE /api/farmer/cows/:id
exports.deleteCow = async (req, res) => {
  try {
    const farmer_code = req.user.code;
    const cowId = req.params.id;

    const deleted = await Cow.findOneAndDelete({ _id: cowId, farmer_code });

    if (!deleted) {
      return res.status(404).json({ message: "Cow not found or unauthorized" });
    }

    res.status(200).json({ message: "Cow deleted successfully" });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ message: "Failed to delete cow", error: error.message });
  }
};


// add cow litres by id


// Add cow litres (creates a CowMilkRecord)
exports.addCowLitres = async (req, res) => {
  try {
    const { id } = req.params; // cow ID
    const { litres } = req.body;

    if (!litres || isNaN(litres)) {
      return res.status(400).json({ message: "❌ Please provide valid litres" });
    }

    // Detect farmer
    const farmerId = req.user.id;

    // Expanded timeslots (6)
    const currentHour = new Date().getHours();
    let time_slot = "";

    if (currentHour >= 4 && currentHour < 8) time_slot = "early_morning";
    else if (currentHour >= 8 && currentHour < 11) time_slot = "morning";
    else if (currentHour >= 11 && currentHour < 14) time_slot = "midday";
    else if (currentHour >= 14 && currentHour < 17) time_slot = "afternoon";
    else if (currentHour >= 17 && currentHour < 20) time_slot = "evening";
    else time_slot = "night";

    // Ensure cow exists & belongs to farmer
    // const cow = await Cow.findOne({ _id: id, farmer_id: farmerId });
    const cow = await Cow.findOne({ _id: id, farmer_code: req.user.farmer_code });

    if (!cow) {
      return res.status(404).json({ message: "🐄 Cow not found or unauthorized" })
    }

    // Prevent duplicate entry for same cow+slot+day
    const todayStart = moment().startOf("day").toDate();
    const todayEnd = moment().endOf("day").toDate();

    const exists = await CowMilkRecord.findOne({
      animal_id: cow._id,
      farmer: farmerId,
      time_slot,
      collection_date: { $gte: todayStart, $lte: todayEnd }
    });

    if (exists) {
      return res.status(400).json({
        message: `⛔ Milk already recorded for the ${time_slot} slot today`
      });
    }

    // Save record
    const record = await CowMilkRecord.create({
      animal_id: cow._id,
      farmer: farmerId,
      farmer_code: cow.farmer_code,
      cow_name: cow.cow_name,
      cow_code: cow.cow_code,
      litres,
      time_slot,
      collection_date: new Date()
    });

    res.status(200).json({
      message: `✅ Milk recorded successfully for ${time_slot} slot`,
      cow_id: cow._id,
      cow_name: cow.cow_name,
      litres: record.litres,
      time_slot: record.time_slot,
      recorded_at: moment(record.collection_date).format("YYYY-MM-DD HH:mm:ss")
    });

  } catch (err) {
    console.error("Error in addCowLitres:", err);
    res.status(500).json({ message: "❌ Failed to record milk", error: err.message });
  }
};

// Get cow daily summary (group by date)
exports.getCowLitresSummary = async (req, res) => {
  try {
    const farmer_code = Number(req.user.code);
    const { id } = req.params;

    const cow = await Cow.findOne({ _id: id, farmer_code });
    if (!cow) {
      return res.status(404).json({ message: "Cow not found or unauthorized" });
    }

    const records = await CowMilkRecord.find({ animal_id: cow._id, farmer_code });

    const summary = {};
    records.forEach(r => {
      const date = r.collection_date.toISOString().split("T")[0];
      summary[date] = (summary[date] || 0) + r.litres;
    });

    res.status(200).json({ cow_name: cow.cow_name, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching litres summary", error: err.message });
  }
};

// Get last 7 days for a cow
exports.getCowLast7Days = async (req, res) => {
  try {
    const farmer_code = Number(req.user.code);
    const { id } = req.params;

    const cow = await Cow.findOne({ _id: id, farmer_code });
    if (!cow) return res.status(404).json({ message: "Cow not found or unauthorized" });

    const start = moment().subtract(6, "days").startOf("day").toDate();
    const records = await CowMilkRecord.find({
      animal_id: cow._id,
      farmer_code,
      collection_date: { $gte: start }
    }).sort({ collection_date: 1 });

    let total = 0;
    const weeklySummary = records.map(r => {
      total += r.litres;
      return {
        day: moment(r.collection_date).format("dddd"),
        date: moment(r.collection_date).format("YYYY-MM-DD"),
        litres: r.litres,
        week: `Week ${Math.ceil(moment(r.collection_date).date() / 7)}`,
        month: moment(r.collection_date).format("MMMM")
      };
    });

    res.status(200).json({
      cow_name: cow.cow_name,
      cow_id: cow._id,
      weekly_trend: weeklySummary,
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

    const start = moment().startOf("month").toDate();
    const end = moment().endOf("month").toDate();

    const records = await CowMilkRecord.find({
      animal_id: cow._id,
      farmer_code,
      collection_date: { $gte: start, $lte: end }
    });

    const weeks = {};
    records.forEach(r => {
      const date = moment(r.collection_date);
      const weekNum = `Week ${Math.ceil(date.date() / 7)}`;
      const rangeStart = date.clone().startOf("week").format("MMM D");
      const rangeEnd = date.clone().endOf("week").format("MMM D");
      const key = `${weekNum} (${rangeStart} - ${rangeEnd})`;

      if (!weeks[key]) {
        weeks[key] = {
          week: weekNum,
          date_range: `${rangeStart} - ${rangeEnd}`,
          total_litres: 0,
          month: date.format("MMMM")
        };
      }
      weeks[key].total_litres += r.litres;
    });

    res.status(200).json({
      cow_name: cow.cow_name,
      cow_id: cow._id,
      monthly_summary: Object.values(weeks)
    });
  } catch (err) {
    console.error(err);
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
    const trend = weekdayMap.reduce((acc, day) => ({ ...acc, [day]: 0 }), {});

    records.forEach(r => {
      const day = new Date(r.collection_date).getDay();
      trend[weekdayMap[day]] += r.litres;
    });

    res.status(200).json({ cow_name: cow.cow_name, trend });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch weekly trend", error: err.message });
  }
};

