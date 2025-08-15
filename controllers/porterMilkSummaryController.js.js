const { Farmer, Porter, MilkRecord } = require('../models/model');
const ExcelJS = require('exceljs');


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


// gett individual porter record
exports.getMyMonthlyMilkSummary = async (req, res) => {
  try {
    if (req.user.role !== 'porter') {
      return res.status(403).json({ message: 'Access denied: Only porters can view this' });
    }

    const porterId = req.user.id;

    // Get start and end of current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Fetch all milk records for this porter in the current month
    const records = await MilkRecord.find({
      created_by: porterId,
      collection_date: { $gte: startOfMonth, $lte: endOfMonth }
    }).lean();

    if (!records.length) {
      return res.status(200).json({
        porter: req.user.name,
        month: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
        farmers: [],
        total_litres_for_month: 0,
        total_deliveries: 0
      });
    }

    // Fetch farmers for name mapping
    const farmerCodes = [...new Set(records.map(r => r.farmer_code))];
    const farmers = await Farmer.find({ farmer_code: { $in: farmerCodes } }).lean();
    const farmerMap = {};
    farmers.forEach(f => farmerMap[f.farmer_code] = f.fullname);

    // Aggregate litres per farmer
    const farmerSummary = {};
    let totalLitres = 0;

    records.forEach(rec => {
      if (!farmerSummary[rec.farmer_code]) {
        farmerSummary[rec.farmer_code] = {
          farmer_code: rec.farmer_code,
          farmer_name: farmerMap[rec.farmer_code] || 'Unknown Farmer',
          total_litres: 0
        };
      }
      farmerSummary[rec.farmer_code].total_litres += rec.litres;
      totalLitres += rec.litres;
    });

    const result = {
      porter: req.user.name,
      month: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
      farmers: Object.values(farmerSummary).sort((a, b) =>
        a.farmer_name.localeCompare(b.farmer_name)
      ),
      total_litres_for_month: totalLitres,
      total_deliveries: records.length
    };

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to generate monthly summary', error: error.message });
  }
};



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


// controllers/milkController.js

// This function can be called both via HTTP and internally for socket updates
// Get Monthly Milk Summary for Admin's Active Porters
exports.getAdminPortersMonthlySummary = async (req, res) => {
  try {
    const admin_id = req.user.id;
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ message: "Year and month are required" });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    // 1️⃣ Get all porters created by admin (active or not)
    const adminPorters = await Porter.find({ created_by: admin_id }).select("_id name is_active").lean();

    const adminPorterIds = adminPorters.map(p => p._id);

    if (adminPorterIds.length === 0) {
      return res.json({
        admin_id,
        month: parseInt(month),
        year: parseInt(year),
        total_milk_litres_collected_by_admin_porters: 0,
        total_deliveries_by_admin_porters: 0,
        porters: []
      });
    }

    // 2️⃣ Aggregate total litres and deliveries collected by admin's porters in the month
    const overallTotalsAgg = await MilkRecord.aggregate([
      {
        $match: {
          created_by: { $in: adminPorterIds },
          collection_date: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalLitres: { $sum: "$litres" },
          totalDeliveries: { $sum: 1 }
        }
      }
    ]);

    const overallTotals = overallTotalsAgg.length ? overallTotalsAgg[0] : { totalLitres: 0, totalDeliveries: 0 };

    // 3️⃣ Aggregate totals per porter (admin's porters)
    const porterTotalsAgg = await MilkRecord.aggregate([
      {
        $match: {
          created_by: { $in: adminPorterIds },
          collection_date: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: "$created_by",
          totalLitres: { $sum: "$litres" },
          totalDeliveries: { $sum: 1 }
        }
      }
    ]);

    // 4️⃣ Map totals to admin porters
    const portersWithTotals = adminPorters.map(porter => {
      const totalRecord = porterTotalsAgg.find(t => t._id.toString() === porter._id.toString());
      return {
        porter_id: porter._id,
        porter_name: porter.name,
        is_active: porter.is_active,
        total_litres: totalRecord ? totalRecord.totalLitres : 0,
        total_deliveries: totalRecord ? totalRecord.totalDeliveries : 0
      };
    });

    // 5️⃣ Return final response
    res.json({
      admin_id,
      month: parseInt(month),
      year: parseInt(year),
      total_milk_litres_collected_by_admin_porters: overallTotals.totalLitres,
      total_deliveries_by_admin_porters: overallTotals.totalDeliveries,
      porters: portersWithTotals
    });

  } catch (error) {
    console.error("Error fetching monthly porters summary:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};



// admin get porters milk summary
// const Farmer = require('./models/Farmer');       // Adjust your Farmer model path
// const MilkRecord = require('./models/MilkRecord'); // Adjust your MilkRecord model path

exports.downloadMonthlyMilkReport = async (req, res) => {
  try {
    const adminId = req.user.userId || req.user.id;

    // Get the month param in "YYYY-MM" format from query, default to current month
    const monthParam = req.query.month || (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    })();

    const [year, month] = monthParam.split('-').map(Number);
    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ message: "Invalid month format. Use 'YYYY-MM'." });
    }

    // Calculate month start and end dates
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999); // last day of the month

    // Find farmers linked to admin
    const farmers = await Farmer.find({ created_by: adminId }).lean();

    if (!farmers || farmers.length === 0) {
      return res.status(404).json({ message: 'No farmers found for this admin.' });
    }

    // Gather summaries
    const summaries = await Promise.all(
      farmers.map(async (farmer) => {
        const records = await MilkRecord.find({
          farmer_code: farmer.farmer_code,
          collection_date: { $gte: monthStart, $lte: monthEnd }
        }).lean();

        const monthly_total = records.reduce((sum, r) => sum + r.litres, 0);

        return {
          farmer_name: farmer.fullname,
          farmer_code: farmer.farmer_code,
          monthly_total
        };
      })
    );

    // Create Excel workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Monthly Milk Report');

    // Define columns
    worksheet.columns = [
      { header: 'Farmer Name', key: 'farmer_name', width: 30 },
      { header: 'Farmer Code', key: 'farmer_code', width: 30 },
      { header: 'Total Milk Collected (Litres)', key: 'monthly_total', width: 25 }
    ];

    // Add rows
    summaries.forEach(summary => {
      worksheet.addRow(summary);
    });

    // Style header row
    worksheet.getRow(1).font = { bold: true };

    // Set response headers to trigger download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=milk_report_${monthParam}.xlsx`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("Error generating Excel report:", error);
    res.status(500).json({ message: 'Failed to generate monthly milk report', error: error.message });
  }
}


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
}