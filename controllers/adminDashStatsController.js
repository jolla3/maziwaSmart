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

    // Get IDs of porters and farmers created by this admin
    const [adminPorterIds, adminFarmerIds] = await Promise.all([
      Porter.find({ created_by: adminId }).distinct('_id'),
      Farmer.find({ created_by: adminId }).distinct('_id'),
    ]);

    // Counts scoped to this admin
    const [totalFarmers, totalPorters] = await Promise.all([
      Farmer.countDocuments({ created_by: adminId }),
      Porter.countDocuments({ created_by: adminId }),
    ]);

    // Count milk records strictly where porter and farmer belong to this admin
    const totalMilkRecords = await MilkRecord.countDocuments({
      created_by: { $in: adminPorterIds },
      farmer: { $in: adminFarmerIds },
    });

    // Sum total litres collected by admin's porters for admin's farmers
    const totalMilkLitresAgg = await MilkRecord.aggregate([
      {
        $match: {
          created_by: { $in: adminPorterIds },
          farmer: { $in: adminFarmerIds },
        }
      },
      {
        $group: {
          _id: null,
          totalLitres: { $sum: "$litres" }
        }
      }
    ]);
    const totalMilkLitres = totalMilkLitresAgg.length ? totalMilkLitresAgg[0].totalLitres : 0;

    // Calculate percentage distributions
    const totalUsers = totalFarmers + totalPorters;
    const farmerPercentage = totalUsers ? ((totalFarmers / totalUsers) * 100).toFixed(1) : '0.0';
    const porterPercentage = totalUsers ? ((totalPorters / totalUsers) * 100).toFixed(1) : '0.0';

    // Recent milk records filtered by admin ownership
    const recentMilk = await MilkRecord.find({
      created_by: { $in: adminPorterIds },
      farmer: { $in: adminFarmerIds },
    })
      .sort({ collection_date: -1 })
      .limit(5)
      .populate('created_by', 'name')          // Porter (has name)
      .populate('farmer', 'fullname farmer_code') // Farmer (has fullname + farmer_code)
      .lean();

    // Recent farmers for this admin
    const recentFarmers = await Farmer.find({ created_by: adminId })
      .sort({ join_date: -1 })
      .limit(5)
      .select('fullname farmer_code join_date')
      .lean();

    // Recent porters for this admin
    const recentPorters = await Porter.find({ created_by: adminId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name createdAt')
      .lean();

    // Combine recent activities
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

    // Prepare last 7 days date array
    const today = new Date();
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      return safeFormatDate(d);
    }).reverse();

    // Define start and end date with time boundary
    const startDate = new Date(last7Days[0]);
    const endDate = new Date(last7Days[last7Days.length - 1]);
    endDate.setHours(23, 59, 59, 999);  // Include entire last day

    // Aggregate total litres per day for admin's porters and farmers
    const milkPerDayAgg = await MilkRecord.aggregate([
      {
        $match: {
          created_by: { $in: adminPorterIds },
          farmer: { $in: adminFarmerIds },
          collection_date: {
            $gte: startDate,
            $lte: endDate,
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

    // Map aggregation results to last 7 days, fill zeros if no data for a day
    const milkPerDay = last7Days.map(day => {
      const record = milkPerDayAgg.find(r => r._id === day);
      return { date: day, milk: record ? record.totalLitres : 0 };
    });

    // Respond with all aggregated stats
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
