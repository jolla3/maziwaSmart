// 🚀 Porter Dashboard Controller
const {
     User,
  Farmer,
  Manager,
  Porter,
  PorterLog, 
  Breed,
  Cow,
  MilkRecord,
  DailyMilkSummary,
  Insemination,
  VetLog,
  MilkAnomaly,
  Payment,
  Notification,
  Report,
  SmsLog
} = require('../models/model'); // adjust path as needed
// 🚀 Porter Dashboard Controller with Graph Data
const mongoose = require("mongoose");
// assuming you already import MilkRecord, Farmer, etc.
// controllers/porterDashStats.js
// const { MilkRecord } = require("../models/model"); // <-- use your path

exports.porterDashStats = async (req, res) => {
  try {
    if (req.user?.role !== "porter") {
      return res.status(403).json({ message: "Only porters can access dashboard stats" });
    }

    // always work with a string; cast inside the pipeline using $toObjectId
    const porterIdStr = (req.user.id || req.user._id).toString();

    // ---- date ranges ----
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();   todayEnd.setHours(23, 59, 59, 999);

    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const startOfThisMonth = new Date();
    startOfThisMonth.setDate(1);
    startOfThisMonth.setHours(0, 0, 0, 0);
    const sixMonthsAgo = new Date(startOfThisMonth);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);

    // helpers
    const litreSum = { $sum: { $toDouble: { $ifNull: ["$litres", 0] } } };
    const matchPorterExpr = { $expr: { $eq: ["$created_by", { $toObjectId: porterIdStr }] } };

    // ---- parallel queries ----
    const [
      totalLitresAgg,
      todayLitresAgg,
      totalRecords,
      todayRecords,
      recentCollectionsRaw,
      dailyLitresAgg,
      slotBreakdownAgg,
      monthlyLitresAgg,
    ] = await Promise.all([
      // total litres all-time
      MilkRecord.aggregate([
        { $match: matchPorterExpr },
        { $group: { _id: null, total: litreSum } },
      ]),

      // litres today
      MilkRecord.aggregate([
        { $match: { ...matchPorterExpr, collection_date: { $gte: todayStart, $lte: todayEnd } } },
        { $group: { _id: null, total: litreSum } },
      ]),

      // total records all-time (simple queries auto-cast)
      MilkRecord.countDocuments({ created_by: porterIdStr }),

      // records today
      MilkRecord.countDocuments({
        created_by: porterIdStr,
        collection_date: { $gte: todayStart, $lte: todayEnd },
      }),

      // recent collections (latest 5)
      MilkRecord.find({ created_by: porterIdStr })
        .sort({ collection_date: -1 })
        .limit(5)
        .populate("farmer", "fullname farmer_code")
        .lean(),

      // daily litres trend (last 7 days)
      MilkRecord.aggregate([
        { $match: { ...matchPorterExpr, collection_date: { $gte: sevenDaysAgo, $lte: todayEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$collection_date" } },
            totalLitres: litreSum,
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // time-slot breakdown (last 7 days)
      MilkRecord.aggregate([
        { $match: { ...matchPorterExpr, collection_date: { $gte: sevenDaysAgo, $lte: todayEnd } } },
        { $group: { _id: "$time_slot", totalLitres: litreSum } },
        { $sort: { _id: 1 } },
      ]),

      // monthly litres trend (last 6 months)
      MilkRecord.aggregate([
        { $match: { ...matchPorterExpr, collection_date: { $gte: sixMonthsAgo, $lte: todayEnd } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$collection_date" } },
            totalLitres: litreSum,
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const getTotal = (agg) => (agg && agg.length ? Number(agg[0].total) : 0);

    // fill missing days with 0 for the last 7 days
    const dailyMap = new Map(dailyLitresAgg.map(d => [d._id, Number(d.totalLitres || 0)]));
    const dailyLitresTrend = [];
    for (let d = new Date(sevenDaysAgo); d <= todayEnd; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      dailyLitresTrend.push({ date: key, totalLitres: dailyMap.get(key) ?? 0 });
    }

    const timeSlotBreakdown = slotBreakdownAgg.map(s => ({
      timeSlot: s._id,
      totalLitres: Number(s.totalLitres || 0),
    }));

    const monthlyLitresTrend = monthlyLitresAgg.map(m => ({
      month: m._id,
      totalLitres: Number(m.totalLitres || 0),
    }));

    const recentCollections = recentCollectionsRaw.map(r => ({
      litres: r.litres,
      time_slot: r.time_slot,
      collection_date: r.collection_date,
      farmer_code: r.farmer?.farmer_code ?? null,
      farmer_name: r.farmer?.fullname ?? "Unknown Farmer",
    }));

    res.json({
      porter: req.user.name,
      totalLitresCollected: getTotal(totalLitresAgg),
      litresCollectedToday: getTotal(todayLitresAgg),
      totalRecords,
      todayRecords,
      recentCollections,
      dailyLitresTrend,
      timeSlotBreakdown,
      monthlyLitresTrend,
    });
  } catch (err) {
    console.error("porterDashStats failed:", err);
    res.status(500).json({ message: "Porter dashboard stats failed", error: err.message });
  }
};
