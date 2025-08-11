const {
  User,
  Farmer,
  Porter,
  MilkRecord,
} = require('../models/model'); // adjust path if needed

// Helper to format dates (yyyy-mm-dd)
const formatDate = (d) => d.toISOString().slice(0, 10);

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

    // Recent activities - example: last 5 milk records + last 5 farmers added + last 5 porters added
    // Combine and sort by created date descending, then limit 10
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

    // Format recent activities combining these with simple descriptive text
    let recentActivities = [];

    recentMilk.forEach((r) =>
      recentActivities.push({
        date: formatDate(r.collection_date),
        activity: `Milk record: ${r.litres}L collected by porter ${r.porter_code} from farmer ${r.farmer_code}`,
      })
    );
    recentFarmers.forEach((f) =>
      recentActivities.push({
        date: formatDate(f.created_at),
        activity: `New farmer added: ${f.fullname} (${f.farmer_code})`,
      })
    );
    recentPorters.forEach((p) =>
      recentActivities.push({
        date: formatDate(p.created_at),
        activity: `New porter added: ${p.fullname} (${p.porter_code})`,
      })
    );

    // Sort combined recent activities by date descending and take top 10
    recentActivities = recentActivities
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10);

    // Milk collected per day for last 7 days for chart
    const today = new Date();
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      return formatDate(d);
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

    // Dummy campaign and geography data placeholders — replace with real queries as needed

    // Return all data for frontend
    res.status(200).json({
      totalFarmers,
      totalPorters,
      farmerPercentage,
      porterPercentage,
      totalMilkRecords,
      recentActivities,
      milkPerDay,
    })
     
  } catch (error) {
    console.error("Error fetching admin dashboard stats:", error);
    res.status(500).json({
      message: "Failed to fetch dashboard stats",
      error: error.message,
    });
  }
};
