const { Farmer, Porter, MilkRecord } = require('../models/model'); // adjust path

const safeFormatDate = (d) => {
  if (!d) return "Unknown date";
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d)) return "Invalid date";
  return d.toISOString().slice(0, 10);
};

exports.adminDashStats = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;

    // Get porters and farmers created by this admin
    const [adminPorterIds, adminFarmerIds] = await Promise.all([
      Porter.find({ created_by: adminId }).distinct('_id'),
      Farmer.find({ created_by: adminId }).distinct('_id'),
    ]);

    // Counts
    const [totalFarmers, totalPorters] = await Promise.all([
      Farmer.countDocuments({ created_by: adminId }),
      Porter.countDocuments({ created_by: adminId }),
    ]);

    // Total milk records count by admin's porters
    const totalMilkRecords = await MilkRecord.countDocuments({
      created_by: { $in: adminPorterIds }
    });

    // Sum total litres collected by admin's porters
    const totalMilkLitresAgg = await MilkRecord.aggregate([
      { $match: { created_by: { $in: adminPorterIds } } },
      { $group: { _id: null, totalLitres: { $sum: "$litres" } } }
    ]);
    const totalMilkLitres = totalMilkLitresAgg.length ? totalMilkLitresAgg[0].totalLitres : 0;

    // Calculate percentages out of total farmers + porters
    const totalUsers = totalFarmers + totalPorters;
    const farmerPercentage = totalUsers ? ((totalFarmers / totalUsers) * 100).toFixed(1) : '0.0';
    const porterPercentage = totalUsers ? ((totalPorters / totalUsers) * 100).toFixed(1) : '0.0';

    // Recent milk records (limit 5)
    const recentMilk = await MilkRecord.find({
      created_by: { $in: adminPorterIds },
      farmer: { $in: adminFarmerIds },
    })
      .sort({ collection_date: -1 })
      .limit(5)
      .populate('created_by', 'name')
      .populate('farmer', 'fullname farmer_code')
      .lean();

    // Recent farmers (limit 5)
    const recentFarmers = await Farmer.find({ created_by: adminId })
      .sort({ join_date: -1 })
      .limit(5)
      .select('fullname farmer_code join_date')
      .lean();

    // Recent porters (limit 5)
    const recentPorters = await Porter.find({ created_by: adminId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name createdAt')
      .lean();

    // Build recent activities array combining above
    let recentActivities = [];

    recentMilk.forEach(r => {
      recentActivities.push({
        date: safeFormatDate(r.collection_date),
        activity: `Milk record: ${r.litres}L collected by porter ${r.created_by?.name || 'Unknown'} from farmer ${r.farmer?.fullname || 'Unknown'}`,
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

    // Sort by date descending and take top 10
    recentActivities = recentActivities
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    // Milk collected per day for last 7 days
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

    return res.status(200).json({
      totalFarmers,
      totalPorters,
      farmerPercentage,
      porterPercentage,
      totalMilkRecords,
      totalMilkLitres,
      recentActivities,
      milkPerDay,
    });
  } catch (error) {
    console.error("Error fetching admin dashboard stats:", error);
    res.status(500).json({ message: "Server error" });
  }
};
