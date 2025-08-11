const {
  User,
  Farmer,
  Porter,
  MilkRecord,
} = require('../models/model'); // adjust path if needed

// Helper to safely format dates (yyyy-mm-dd)
const safeFormatDate = (d) => {
  if (!d) return "Unknown date";
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d)) return "Invalid date";
  return d.toISOString().slice(0, 10);
};

// Admin Dashboard Stats Controller
exports.adminDashStats = async (req, res) => {
  try {
    // Get counts in parallel
    const [totalFarmers, totalPorters, totalMilkRecords] = await Promise.all([
      Farmer.countDocuments(),
      Porter.countDocuments(),
      MilkRecord.countDocuments(),
    ]);

    const combinedTotal = totalFarmers + totalPorters;
    const farmerPercentage = combinedTotal
      ? ((totalFarmers / combinedTotal) * 100).toFixed(1)
      : '0.0';
    const porterPercentage = combinedTotal
      ? ((totalPorters / combinedTotal) * 100).toFixed(1)
      : '0.0';

    // Fetch recent activities: last 5 milk records, farmers, and porters
    const recentMilk = await MilkRecord.find()
      .sort({ collection_date: -1 })
      .limit(5)
      .select({ farmer_code: 1, porter_code: 1, litres: 1, collection_date: 1 });

    const recentFarmers = await Farmer.find()
      .sort({ created_at: -1 })
      .limit(5)
      .select({ fullname: 1, farmer_code: 1, created_at: 1 });

    const recentPorters = await Porter.find()
      .sort({ created_at: -1 })
      .limit(5)
      .select({ fullname: 1, porter_code: 1, created_at: 1 });

    // Combine and format recent activities with safe date formatting
    let recentActivities = [];

    recentMilk.forEach((r) =>
      recentActivities.push({
        date: safeFormatDate(r.collection_date),
        activity: `Milk record: ${r.litres}L collected by porter ${r.porter_code} from farmer ${r.farmer_code}`,
      })
    );
    recentFarmers.forEach((f) =>
      recentActivities.push({
        date: safeFormatDate(f.created_at),
        activity: `New farmer added: ${f.fullname} (${f.farmer_code})`,
      })
    );
    recentPorters.forEach((p) =>
      recentActivities.push({
        date: safeFormatDate(p.created_at),
        activity: `New porter added: ${p.fullname} (${p.porter_code})`,
      })
    );

    // Sort combined recent activities by date descending and limit top 10
    recentActivities = recentActivities
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    // Milk collected per day for last 7 days for chart
    const today = new Date();
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      return safeFormatDate(d);
    }).reverse();

    // Aggregate milk records by day (last 7 days)
    const milkPerDayAgg = await MilkRecord.aggregate([
      {
        $match: {
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

    // Map aggregation result into full array matching last7Days, fill missing days with 0
    const milkPerDay = last7Days.map((day) => {
      const record = milkPerDayAgg.find((r) => r._id === day);
      return { date: day, milk: record ? record.totalLitres : 0 };
    });

    // Return all data for frontend
    res.status(200).json({
      totalFarmers,
      totalPorters,
      farmerPercentage,
      porterPercentage,
      totalMilkRecords,
      recentActivities,
      milkPerDay,
    });
  } catch (error) {
    console.error("Error fetching admin dashboard stats:", error);
    res.status(500).json({
      message: "Failed to fetch dashboard stats",
      error: error.message,
    });
  }
};
