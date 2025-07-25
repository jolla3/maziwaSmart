const {
     User,
  Farmer,
Manager,
  Porter,
  PorterLog, 
  Breed,
  Cow,
  MilkRecord,
  Insemination,
  VetLog,
  Payment,
  Notification,
  Report,
  SmsLog
} = require('../models/model'); // adjust path as needed

// Admin Dashboard Stats
exports.adminDashStats = async (req, res) => {
    try {
        const [
            totalFarmers,
            totalMilkRecords,
            totalAnomalies,
            totalPorters,
            activeUsers,
            recentFarmers,
            recentMilkRecords,
            recentAnomalies,
        ] = await Promise.all([
            Farmer.countDocuments(),
            MilkRecord.countDocuments(),
            // MilkAnomality.countDocuments(),
            User.countDocuments({ role: 'porter' }),
            User.countDocuments({ isActive: true }),

            // Recent farmers
            Farmer.find().sort({ created_at: -1 }).limit(5),

            // Recent milk records
            MilkRecord.find().sort({ collection_date: -1 }).limit(5),

            // Recent unresolved anomalies
            // MilkAnomality.find({ resolved: false })
                // .sort({ anomaly_date: -1 })
                // .limit(5),
        ]);

        res.status(200).json({
            totalFarmers,
            totalMilkRecords,
            totalAnomalies,
            totalPorters,
            activeUsers,
            recentFarmers,
            recentMilkRecords,
            recentAnomalies,
        });
    } catch (error) {
        res.status(500).json({ message: 'Dashboard stats failed', error: error.message });
    }
};
