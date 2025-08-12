const {
  Farmer,
  Porter,
  MilkRecord,
} = require('../models/model'); // Adjust path as needed

const safeFormatDate = (d) => {
  if (!d) return "Unknown date";
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d)) return "Invalid date";
  return d.toISOString().slice(0, 10);
};

exports.adminDashStats = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;

    // Get all porters and farmers for this admin once
    const [adminPorterIds, adminFarmerIds] = await Promise.all([
      Porter.find({ created_by: adminId }).distinct('_id'),
      Farmer.find({ created_by: adminId }).distinct('_id'),
    ]);

    // Get counts of farmers and porters
    const [totalFarmers, totalPorters] = await Promise.all([
      Farmer.countDocuments({ created_by: adminId }),
      Porter.countDocuments({ created_by: adminId }),
    ]);

    // Get total milk records count by admin's porters
    const totalMilkRecords = await MilkRecord.countDocuments({
      created_by: { $in: adminPorterIds }
    });

    // Sum total litres collected by admin's porters
    const totalMilkLitresAgg = await MilkRecord.aggregate([
      { $match: { created_by: { $in: adminPorterIds } } },
      { $group: { _id: null, totalLitres: { $sum: "$litres" } } }
    ]);
    const totalMilkLitres = totalMilkLitresAgg.length ? totalMilkLitresAgg[0].totalLitres : 0;

    const farmerPercentage = totalFarmers + totalPorters
      ? ((totalFarmers / (totalFarmers + totalPorters)) * 100).toFixed(1)
      : '0.0';

    const porterPercentage = totalFarmers + totalPorters
      ? ((totalPorters / (totalFarmers + totalPorters)) * 100).toFixed(1)
      : '0.0';

    // Recent milk records
    const recentMilk = await MilkRecord.find({
      created_by: { $in: adminPorterIds },
      farmer: { $in: adminFarmerIds },
    })
      .sort({ collection_date: -1 })
      .limit(5)
      .populate('created_by', 'name')
      .populate('farmer', 'fullname farmer_code')
      .lean();

    // Recent farmers
    const recentFarmers = await Farmer.find({ created_by: adminId })
      .sort({ join_date: -1 })
      .limit(5)
      .select('fullname farmer_code join_date')
      .lean();

    // Recent porters
    const recentPorters = await Porter.find({ created_by: adminId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name createdAt')
      .lean();

    let recentActivities = [];

    recentMilk.forEach(r => {
      recentActivities.push({
        date: safeFormatDate(r.collection_date),
        activity: `Milk record: ${r.litres}L collected by porter ${r.created_by?.name || 'Unknown'} from farmer ${r.farmer?.fullname ||  'Unknown'}`,
      });
    });

    recentFarmers.forEach(f => {
      recentActivities.push({
        date: safeFormatDate(f.join_date),
        activity: `New farmer added: ${f.fullname} (${f.farmer_code})`,
      });
    });

    recentPorters.forEach(p => {
      recentActivities.push({
        date: safeFormatDate(p.createdAt),
        activity: `New porter added: ${p.name}`,
      });
    });

    recentActivities = recentActivities
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    // Milk collected per day (last 7 days) scoped to admin's porters & farmers
    const today = new Date();
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      return safeFormatDate(d);
    }).reverse();

    const milkPerDayAgg = await MilkRecord.aggregate([
      {
        $match: {
          created_by: { $in: adminPorterIds },
          farmer: { $in: adminFarmerIds },
          collection_date: {
            $gte: new Date(last7Days[0]),
            $lte: new Date(last7Days[last7Days.length - 1]),
          },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$collection_date" } },
          totalLitres: { $sum: "$litres" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const milkPerDay = last7Days.map(day => {
      const record = milkPerDayAgg.find(r => r._id === day);
      return { date: day, milk: record ? record.totalLitres : 0 };
    });

    res.status(200).json({
      totalFarmers,
      totalPorters,
      farmerPercentage,
      porterPercentage,
      totalMilkRecords,  // count of records by admin's porters
      totalMilkLitres,   // sum of litres collected by admin's porters
      recentActivities,
      milkPerDay,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
