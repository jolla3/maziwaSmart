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

// ============================
// Farmer Dashboard Controller
// ============================
// 🚀 Farmer Dashboard Controller
exports.farmerDashboard = async (req, res) => {
  try {
    // Ensure only farmers can access
    if (req.user.role !== "farmer") {
      return res
        .status(403)
        .json({ message: "Access denied: Only farmers can view this" });
    }

    const farmerCode = req.user.code;

    // 1. Farmer Info
    const farmer = await Farmer.findOne({ farmer_code: farmerCode });
    if (!farmer) {
      return res.status(404).json({ message: "Farmer not found" });
    }

    // 2. Milk Records
    const milkRecords = await MilkRecord.find({ farmer_code: farmerCode })
      .populate("created_by", "fullname phone") // porter details
      .sort({ collection_date: -1 }) // latest first
      .lean();

    // Stats
    let totalLitres = 0;
    const slotTotals = {}; // group by time slot
    let startDate = null;

    milkRecords.forEach((r) => {
      totalLitres += r.litres;
      slotTotals[r.time_slot] = (slotTotals[r.time_slot] || 0) + r.litres;

      // track first record date
      if (!startDate || r.collection_date < startDate) {
        startDate = r.collection_date;
      }
    });

    // Recent activities (last 5 records)
    const recentActivities = milkRecords.slice(0, 5).map((r) => ({
      date: r.collection_date,
      litres: r.litres,
      slot: r.time_slot,
      porter: r.created_by
        ? { name: r.created_by.fullname, phone: r.created_by.phone }
        : null,
    }));

    // 3. Other Stats
    const cowCount = await Cow.countDocuments({ farmer_code: farmerCode });
    const breedCount = await Breed.countDocuments({ farmer_id: farmer._id });
    const inseminationCount = await Insemination.countDocuments({
      farmer_code: farmerCode,
    });
    const anomalyCount = await MilkAnomaly.countDocuments({
      farmer_code: farmerCode,
    });

    // ✅ Stage breakdown (calves, heifers, cows)
    const stageBreakdown = await Cow.aggregate([
      { $match: { farmer_code: String(farmerCode) } }, // ensure same type
      {
        $group: {
          _id: "$stage",
          count: { $sum: 1 },
        },
      },
    ]);

    // Transform into object: { calf: X, heifer: Y, cow: Z }
    const cowStages = { calf: 0, heifer: 0, cow: 0 };
    stageBreakdown.forEach((s) => {
      cowStages[s._id] = s.count;
    });

    // 4. Managers linked
    const managers = await Manager.find({ farmer_code: farmerCode }).select(
      "name phone email"
    );

    // ============================
    // Final Response
    // ============================
    res.status(200).json({
      farmer: {
        code: farmer.farmer_code,
        name: farmer.fullname,
        email: farmer.email,
        phone: farmer.phone,
        start_date: startDate, // ✅ since first record
      },
      stats: {
        total_milk: totalLitres,
        milk_by_slot: slotTotals, // ✅ usable in graphs
        cows: cowCount,
        cow_stages: cowStages, // ✅ { calf: X, heifer: Y, cow: Z }
        breeds: breedCount,
        inseminations: inseminationCount,
        anomalies: anomalyCount,
        managers,
      },
      recent_activities: recentActivities, // ✅ porter + litres + date
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to load dashboard", error: err.message });
  }
};
