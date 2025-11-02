// services/farmerService.js
const mongoose = require("mongoose");
const { logger } = require("../utils/logger");

const {
  Farmer,
  Cow,
  MilkRecord,
  Breed,
  Insemination,
  MilkAnomaly,
  Manager,
} = require("../models/model");

// 🚀 Builds and returns farmer dashboard payload (no Redis)
exports.getFarmerDashboard = async (user) => {
  if (!user || (!user.code && !user._id)) throw new Error("Invalid user object");

  const farmerCode = user.code;
  const farmerId = user.id; // fallback for cases where code might not exist

  // 1️⃣ Farmer basic info (projected)
  const farmerPromise = Farmer.findOne({
    $or: [{ farmer_code: farmerCode }, { _id: farmerId }],
  })
    .select("fullname email phone farmer_code created_at")
    .lean();

  // 2️⃣ Milk summary aggregation
const milkFacetPromise = MilkRecord.aggregate([
  {
    $match: {
      $or: [
        { farmer_code: farmerCode },
        { farmer_id: new mongoose.Types.ObjectId(farmerId) }
      ],
    },
  },
  {
    $facet: {
      totalMilk: [{ $group: { _id: null, total: { $sum: "$litres" } } }],
      bySlot: [{ $group: { _id: "$time_slot", litres: { $sum: "$litres" } } }],
      recent: [
        { $sort: { collection_date: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "porters",
            localField: "created_by",
            foreignField: "_id",
            as: "porter_info",
          },
        },
        {
          $unwind: {
            path: "$porter_info",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            collection_date: 1,
            litres: 1,
            time_slot: 1,
            "porter_info.name": 1,
            "porter_info.phone": 1,
          },
        },
      ],
    },
  },
]);


  // 3️⃣ Counts in parallel
  const countsPromise = Promise.all([
    Cow.countDocuments({ $or: [{ farmer_code: farmerCode }, { farmer_id: farmerId }] }),
    Breed.countDocuments({ $or: [{ farmer_code: farmerCode }, { farmer_id: farmerId }] }).catch(() => 0),
    Insemination.countDocuments({ $or: [{ farmer_code: farmerCode }, { farmer_id: farmerId }] }).catch(() => 0),
    MilkAnomaly.countDocuments({ $or: [{ farmer_code: farmerCode }, { farmer_id: farmerId }] }).catch(() => 0),
  ]);

  // 4️⃣ Stage breakdown
  const stageBreakdownPromise = Cow.aggregate([
    {
      $match: {
        $or: [{ farmer_code: farmerCode }, { farmer_id: new mongoose.Types.ObjectId(farmerId) }],
      },
    },
    { $group: { _id: "$stage", count: { $sum: 1 } } },
  ]);

  // 5️⃣ Managers linked
  const managersPromise = Manager.find({
    $or: [{ farmer_code: farmerCode }, { farmer_id: farmerId }],
  })
    .select("name phone email")
    .lean();

  // Run all in parallel
  const [farmer, milkFacet, counts, stageBreakdown, managers] = await Promise.all([
    farmerPromise,
    milkFacetPromise,
    countsPromise,
    stageBreakdownPromise,
    managersPromise,
  ]);

  // Transform results
  const totalMilk = milkFacet?.[0]?.totalMilk?.[0]?.total || 0;
  const bySlotRaw = milkFacet?.[0]?.bySlot || [];
  const recentRaw = milkFacet?.[0]?.recent || [];

  const milkBySlot = bySlotRaw.reduce((acc, s) => {
    if (!s._id) return acc;
    acc[s._id] = s.litres;
    return acc;
  }, {});

  const recentActivities = recentRaw.map((r) => ({
  date: r.collection_date,
  litres: r.litres,
  slot: r.time_slot,
  porter: r.porter_info
    ? { name: r.porter_info.name, phone: r.porter_info.phone }
    : null,
}));

  const [cowCount, breedCount, inseminationCount, anomalyCount] = counts;

  const cowStages = stageBreakdown.reduce((acc, s) => {
    acc[s._id || "unknown"] = s.count;
    return acc;
  }, {});

  const payload = {
    farmer: farmer || null,
    stats: {
      total_milk: totalMilk,
      milk_by_slot: milkBySlot,
      cows: cowCount,
      breeds: breedCount,
      inseminations: inseminationCount,
      anomalies: anomalyCount,
      cow_stages: cowStages,
      managers: managers || [],
    },
    recent_activities: recentActivities,
    meta: {
      generated_at: new Date(),
    },
  };

  logger.info(`✅ Farmer dashboard built for: ${farmerCode || farmerId}`);
  return payload;
};
