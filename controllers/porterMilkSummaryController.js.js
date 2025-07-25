const { Farmer, Porter, MilkRecord } = require('../models/model');

// Utility: Get formatted date string (e.g., 2025-07-18)
const formatDate = (date) => new Date(date).toISOString().split('T')[0];

// Utility: Get weekday name from date
const getDayName = (date) => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date(date).getDay()];
};

exports.getPortersMilkSummary = async (req, res) => {
  try {
    const records = await MilkRecord.find().lean();
    const porters = await Porter.find().lean();
    const farmers = await Farmer.find().lean();

    const porterMap = {};
    porters.forEach(p => porterMap[p._id.toString()] = p.name);

    const farmerMap = {};
    farmers.forEach(f => farmerMap[f.farmer_code] = f.fullname);

    const groupedByDate = {};

    for (let rec of records) {
      const dateKey = formatDate(rec.collection_date);
      if (!groupedByDate[dateKey]) groupedByDate[dateKey] = {};

      const timeSlot = rec.time_slot || 'unspecified';
      if (!groupedByDate[dateKey][timeSlot]) groupedByDate[dateKey][timeSlot] = [];

      groupedByDate[dateKey][timeSlot].push({
        porter_id: rec.created_by?.toString() || 'unknown',
        porter_name: porterMap[rec.created_by?.toString()] || 'Unknown Porter',
        farmer_code: rec.farmer_code,
        farmer_name: farmerMap[rec.farmer_code] || 'Unknown Farmer',
        litres: rec.litres
      });
    }

    const finalSummary = [];

    for (let date in groupedByDate) {
      const readableDay = getDayName(date);
      let dateSummary = {
        date,                   // e.g. "2025-07-18"
        day: readableDay,       // e.g. "Friday"
        slots: [],
        porter_totals: {},
        total_litres_for_day: 0
      };

      for (let slot in groupedByDate[date]) {
        const slotRecords = groupedByDate[date][slot];
        const porterFarmerMap = {};
        let totalSlotLitres = 0;

        for (let rec of slotRecords) {
          if (!porterFarmerMap[rec.porter_id]) {
            porterFarmerMap[rec.porter_id] = {
              porter_name: rec.porter_name,
              total_litres: 0,
              farmers: []
            };
          }

          porterFarmerMap[rec.porter_id].total_litres += rec.litres;
          totalSlotLitres += rec.litres;

          porterFarmerMap[rec.porter_id].farmers.push({
            farmer_code: rec.farmer_code,
            farmer_name: rec.farmer_name,
            litres: rec.litres
          });

          // Daily porter total
          if (!dateSummary.porter_totals[rec.porter_name]) {
            dateSummary.porter_totals[rec.porter_name] = 0;
          }
          dateSummary.porter_totals[rec.porter_name] += rec.litres;
        }

        dateSummary.slots.push({
          time_slot: slot,
          total_litres: totalSlotLitres,
          porters: Object.values(porterFarmerMap)
        });

        dateSummary.total_litres_for_day += totalSlotLitres;
      }

      finalSummary.push(dateSummary);
    }

    res.status(200).json(finalSummary);
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate summary', error: error.message });
  }
}



// const { MilkRecord, Farmer } = require('../models/model');
// individual farmers record
exports.farmerMilkSummary = async (req, res) => {
  try {
    // Ensure only farmers access this route
    if (req.user.role !== 'farmer') {
      return res.status(403).json({ message: 'Access denied: Only farmers can view this' });
    }

    // Get farmer using farmer_code from token
    const farmer = await Farmer.findOne({ farmer_code: req.user.farmer_code });
    if (!farmer) {
      return res.status(404).json({ message: 'Farmer not found' });
    }

    const records = await MilkRecord.find({ farmer_code: farmer.farmer_code }).lean();

    const summary = {
      morning: {},
      midmorning: {},
      afternoon: {}
    };

    const formatDate = (date) => new Date(date).toISOString().split('T')[0];

    records.forEach(rec => {
      const date = formatDate(rec.collection_date);
      const slot = rec.time_slot;

      if (!summary[slot][date]) {
        summary[slot][date] = 0;
      }
      summary[slot][date] += rec.litres;
    });

    // Prepare frontend format
    const formatted = {};
    for (let slot of ['morning', 'midmorning', 'afternoon']) {
      formatted[slot] = Object.entries(summary[slot]).map(([date, litres]) => ({
        date,
        litres
      }));
    }

    res.status(200).json({
      farmer_code: farmer.farmer_code,
      farmer_name: farmer.fullname,
      summary: formatted
    });

  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch milk summary', error: error.message });
  }
};



// get momnthly analysis
exports.getMonthlyPorterMilkSummary = async (req, res) => {
  try {
    if (!['porter', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied: Only porters and admins can access this route' });
    }

    const porterId = req.user.id;
    const today = new Date();

    const pastWeek = new Date(today);
    pastWeek.setDate(today.getDate() - 7);

    const pastMonth = new Date(today);
    pastMonth.setMonth(today.getMonth() - 1);

    const allRecords = await MilkRecord.find({
      created_by: porterId,
      collection_date: { $gte: pastMonth, $lte: today }
    }).lean();

    const weeklyRecords = allRecords.filter(
      record => new Date(record.collection_date) >= pastWeek
    );

    const weeklySummary = {
      from: pastWeek.toISOString().split('T')[0],
      to: today.toISOString().split('T')[0],
      total_deliveries: weeklyRecords.length,
      total_litres: weeklyRecords.reduce((sum, r) => sum + r.litres, 0)
    };

    const monthlySummary = {
      from: pastMonth.toISOString().split('T')[0],
      to: today.toISOString().split('T')[0],
      total_deliveries: allRecords.length,
      total_litres: allRecords.reduce((sum, r) => sum + r.litres, 0)
    };

    res.status(200).json({
      porter_id: porterId,
      weekly_summary: weeklySummary,
      monthly_summary: monthlySummary
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch porter milk summary', error: error.message });
  }
}


// admin get porters milk summary

const { Types } = require('mongoose')
// CONTROLLER FUNCTION - Admin Overview of Registered Porters' Milk Collection
const { ObjectId } = require('mongodb');

exports.getAdminMilkCollectionSummary = async (req, res) => {
  try {
    const adminId = req.user.userId || req.user.id; // Support both cases

    console.log("Authenticated Admin ID:", adminId); // Check this in your logs

    const porters = await Porter.find({ created_by: adminId }).lean();

    if (!porters || porters.length === 0) {
      return res.status(200).json({ message: 'No porters found for this admin.', summaries: [] });
    }

    const today = new Date();
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(today.getDate() - 7);
    const oneMonthAgo = new Date(today);
    oneMonthAgo.setMonth(today.getMonth() - 1);

    const summaries = await Promise.all(
      porters.map(async (porter) => {
        const monthlyRecords = await MilkRecord.find({
          created_by: porter._id,
          collection_date: { $gte: oneMonthAgo, $lte: today }
        }).lean();

        const weeklyRecords = monthlyRecords.filter(
          (record) => new Date(record.collection_date) >= oneWeekAgo
        );

        return {
          porter_id: porter._id,
          porter_name: porter.name,
          weekly_summary: {
            from: oneWeekAgo.toISOString().split('T')[0],
            to: today.toISOString().split('T')[0],
            total_deliveries: weeklyRecords.length,
            total_litres: weeklyRecords.reduce((sum, r) => sum + r.litres, 0)
          },
          monthly_summary: {
            from: oneMonthAgo.toISOString().split('T')[0],
            to: today.toISOString().split('T')[0],
            total_deliveries: monthlyRecords.length,
            total_litres: monthlyRecords.reduce((sum, r) => sum + r.litres, 0)
          }
        };
      })
    );

    return res.status(200).json({ summaries });

  } catch (error) {
    console.error("Error in summary:", error);
    return res.status(500).json({ message: 'Failed to fetch porter milk summary', error: error.message });
  }
};



// Get summary of each farmer's daily and total milk collected for current month
exports.getFarmerMonthlySummary = async (req, res) => {
  try {
    const adminId = req.user.userId;

    // 1. Get the first and last day of current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of month

    // 2. Get all farmers registered by this admin
    const farmers = await Farmer.find({ created_by: adminId });

    if (!farmers.length) {
      return res.status(404).json({ message: 'No farmers found for this admin', summaries: [] });
    }

    const summaries = [];

    for (const farmer of farmers) {
      const records = await MilkRecord.find({
        farmer_code: farmer.farmer_code,
        collection_date: {
          $gte: startOfMonth,
          $lte: endOfMonth
        }
      });

      // Group by date
      const dailyMap = {};

      for (const record of records) {
        const dateStr = record.collection_date.toISOString().split('T')[0]; // yyyy-mm-dd

        if (!dailyMap[dateStr]) {
          dailyMap[dateStr] = 0;
        }

        dailyMap[dateStr] += record.litres;
      }

      const dailyRecords = Object.entries(dailyMap).map(([date, litres]) => ({
        date,
        total_litres: litres
      }));

      const monthlyTotal = records.reduce((sum, r) => sum + r.litres, 0);

      summaries.push({
        farmer_name: farmer.fullname,
        farmer_code: farmer.farmer_code,
        daily_records: dailyRecords,
        monthly_total: monthlyTotal
      });
    }

    res.status(200).json({ month: now.toISOString().slice(0, 7), summaries });

  } catch (error) {
    console.error('Failed to generate farmer milk summary', error);
    res.status(500).json({
      message: 'Failed to generate farmer milk summary',
      error: error.message
    });
  }
};