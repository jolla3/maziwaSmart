const { Cow, MilkRecord } = require('../models/model');
const moment = require('moment')

// POST /api/farmer/cows
exports.createCow = async (req, res) => {
  try {
    const { cow_name, breed_id, gender, birth_date, litres_per_day, mother_id } = req.body;
    const farmer_id = req.user._id;
    const farmer_code = req.user.code;

    const newCow = new Cow({
      cow_name,
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
      filter.stage = stage;
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

exports.addCowLitres = async (req, res) => {
  try {
    const { id } = req.params; // cow ID
    const { litres } = req.body;
    const farmer_code = req.user.code;

    if (!litres || isNaN(litres)) {
      return res.status(400).json({ message: "❌ Please provide valid litres" });
    }

    // Auto-detect time_slot
    const currentHour = new Date().getHours();
    let time_slot = '';

    if (currentHour >= 4 && currentHour < 10) time_slot = 'morning';
    else if (currentHour >= 10 && currentHour < 14) time_slot = 'midmorning';
    else if (currentHour >= 14 && currentHour < 18) time_slot = 'afternoon';
    else time_slot = 'evening';

    const today = moment().startOf('day');

    // Find cow by ID, farmer_code, and active
    const cow = await Cow.findOne({ _id: id, farmer_code, is_active: true });
    if (!cow) {
      return res.status(404).json({ message: "🐄 Cow not found or unauthorized" });
    }

    // Check if record for this time_slot already exists today
    const alreadyRecorded = cow.litres_records.some(record => {
      const recordDate = moment(record.date);
      return recordDate.isSame(today, 'day') && record.time_slot === time_slot;
    });

    if (alreadyRecorded) {
      return res.status(400).json({
        message: `⛔ Milk already recorded for the ${time_slot} slot today`
      });
    }

    // Add record
    cow.litres_records.push({
      litres,
      time_slot,
      date: new Date()
    });

    await cow.save();

    res.status(200).json({
      message: `✅ Milk recorded successfully for ${time_slot} slot`,
      cow_id: cow._id,
      cow_name: cow.cow_name,
      litres,
      time_slot,
      recorded_at: moment().format('YYYY-MM-DD HH:mm:ss')
    });

  } catch (err) {
    console.error("Error in addCowLitres:", err);
    res.status(500).json({ message: "❌ Failed to record milk", error: err.message });
  }
};

// get cow litres summary cow_id 
exports.getCowLitresSummary = async (req, res) => {
  try {
    const farmer_id = req.user.userId;
    const { id } = req.params; // cow ID

    const cow = await Cow.findOne({ _id: id, farmer_id });

    if (!cow) {
      return res.status(404).json({ message: 'Cow not found or unauthorized' });
    }

    const summary = {};

    cow.litres_records.forEach(record => {
      const date = record.date.toISOString().split('T')[0];
      if (!summary[date]) {
        summary[date] = 0;
      }
      summary[date] += record.litres;
    });

    res.status(200).json({ cow_name: cow.cow_name, summary });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching litres summary', error: error.message });
  }
}


// get weekly cow_id milk record

exports.getCowLast7Days = async (req, res) => {
  try {
    const { id } = req.params; // cow ID
    const farmerId = req.user._id; // from token

    // Ensure cow belongs to this farmer
    const cow = await Cow.findOne({ _id: id, farmer_id: farmerId });
    if (!cow) {
      return res.status(404).json({ message: "Cow not found or unauthorized" });
    }

    const now = moment();
    const startOfWeek = now.clone().startOf('week');
    const endOfWeek = now.clone().endOf('week');

    const last7Days = cow.litres_records.filter(record => {
      const recordDate = moment(record.date);
      return recordDate.isBetween(startOfWeek, endOfWeek, null, '[]');
    });

    let totalLitres = 0;
    const weeklySummary = last7Days.map(record => {
      const litres = record.litres;
      totalLitres += litres;
      return {
        day: moment(record.date).format('dddd'),
        date: moment(record.date).format('YYYY-MM-DD'),
        litres,
        week: `Week ${Math.ceil(moment(record.date).date() / 7)}`,
        month: moment(record.date).format('MMMM')
      };
    });

    res.status(200).json({
      cow_name: cow.cow_name,
      cow_id: cow._id,
      weekly_trend: weeklySummary,
      total_litres_this_week: totalLitres
    });

  } catch (error) {
    console.error("Weekly trend error:", error);
    res.status(500).json({
      message: "Failed to fetch weekly trend",
      error: error.message
    });
  }
};

// get momthly cow MilkRecord
exports.getCowMonthlyTotal = async (req, res) => {
   try {
    const { id } = req.params;
    const farmerId = req.user.userId;

    const cow = await Cow.findOne({ _id: id });
    if (!cow) {
      return res.status(404).json({ message: "Cow not found " });
    }

    const farmers = await Cow.findOne({ farmerId });
    if (!farmers) 
      return res.status(404).json({ message: "Farmer not found" });
    

    const currentMonth = moment().month();
    const currentYear = moment().year();

    const recordsInMonth = cow.litres_records.filter((record) => {
      const date = moment(record.date);
      return date.month() === currentMonth && date.year() === currentYear;
    });

    const weeks = {};

    recordsInMonth.forEach(record => {
      const date = moment(record.date);
      const weekNum = `Week ${Math.ceil(date.date() / 7)}`;
      const rangeStart = date.clone().startOf('week').format('MMM D');
      const rangeEnd = date.clone().endOf('week').format('MMM D');
      const key = `${weekNum} (${rangeStart} - ${rangeEnd})`;

      if (!weeks[key]) {
        weeks[key] = {
          week: weekNum,
          date_range: `${rangeStart} - ${rangeEnd}`,
          total_litres: 0,
          month: date.format('MMMM')
        };
      }

      weeks[key].total_litres += record.litres;
    });

    const summary = Object.values(weeks);

    res.status(200).json({ cow_name: cow.cow_name,cow_id: id, monthly_summary: summary });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch monthly summary", error: error.message });
  }
};

// get the monthly trend for a cow [single]
exports.getCowWeeklyTrend = async (req, res) => {
  try {
    const { id } = req.params;
    const farmer_id = req.user.userId;

    const farmer= await Cow.find({  farmer_id})
    if (!farmer) 
      return res.status(404).json({ message: "Farmer not found " });

    const cow = await Cow.findOne({ _id: id });

    if (!cow) return res.status(404).json({ message: 'Cow not found ' });

    const weekdayMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const trend = {
      Sunday: 0,
      Monday: 0,
      Tuesday: 0,
      Wednesday: 0,
      Thursday: 0,
      Friday: 0,
      Saturday: 0
    };

    cow.litres_records.forEach(record => {
      const day = new Date(record.date).getDay();
      const weekday = weekdayMap[day];
      trend[weekday] += record.litres;
    });

    res.status(200).json({ cow_name: cow.cow_name, trend });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch weekly trend', error: err.message });
  }
}

