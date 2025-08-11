const {
  User,
  Farmer,
  Porter,
  MilkRecord,
} = require('../models/model'); // adjust path if needed

// Admin Dashboard Stats Controller
exports.adminDashStats = async (req, res) => {
  try {
    // Get counts in parallel
    const [totalFarmers, totalPorters, totalMilkRecords] = await Promise.all([
      Farmer.countDocuments(),
      Porter.countDocuments(),
      MilkRecord.countDocuments(),
    ]);

    // Calculate combined total (farmers + porters)
    const combinedTotal = totalFarmers + totalPorters;

    // Calculate percentages, handle division by zero
    const farmerPercentage = combinedTotal
      ? ((totalFarmers / combinedTotal) * 100).toFixed(1)
      : '0.0';
    const porterPercentage = combinedTotal
      ? ((totalPorters / combinedTotal) * 100).toFixed(1)
      : '0.0';

    // Get some recent farmers and milk records for frontend display (optional)
    const recentFarmers = await Farmer.find().sort({ created_at: -1 }).limit(5);
    const recentMilkRecords = await MilkRecord.find()
      .sort({ collection_date: -1 })
      .limit(5);

    // Send JSON response
    res.status(200).json({
      totalFarmers,
      totalPorters,
      farmerPercentage,
      porterPercentage,
      totalMilkRecords,
      recentFarmers,
      recentMilkRecords,
    });
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error);
    res.status(500).json({
      message: 'Failed to fetch dashboard stats',
      error: error.message,
    });
  }
};
