// 🚀 Porter Dashboard Controller
const {
    Farmer,
    MilkRecord,
    MilkAnomality,
    PorterMilkRecord,
    BotMessage,
    User,
} = require('../models/model'); // adjust path as needed

exports.porterDashStats = async (req, res) => {
  try {
    if (req.user.role !== 'porter') {
      return res.status(403).json({ message: 'Only porters can access dashboard stats' });
    }

    const porterId = req.user.id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Run stats in parallel
    const [
      totalLitres,
      todayLitres,
      totalRecords,
      todayRecords,
      recentCollections,
    ] = await Promise.all([
      MilkRecord.aggregate([
        { $match: { created_by: porterId } },
        { $group: { _id: null, total: { $sum: "$litres" } } }
      ]),
      MilkRecord.aggregate([
        {
          $match: {
            created_by: porterId,
            collection_date: { $gte: todayStart, $lte: todayEnd }
          }
        },
        { $group: { _id: null, total: { $sum: "$litres" } } }
      ]),
      MilkRecord.countDocuments({ created_by: porterId }),
      MilkRecord.countDocuments({
        created_by: porterId,
        collection_date: { $gte: todayStart, $lte: todayEnd }
      }),
      MilkRecord.find({ created_by: porterId })
        .sort({ collection_date: -1 })
        .limit(5)
    ]);

    const getLitres = (result) => (result.length ? result[0].total : 0);

    res.status(200).json({
      porter: req.user.name,
      totalLitresCollected: getLitres(totalLitres),
      litresCollectedToday: getLitres(todayLitres),
      totalRecords,
      todayRecords,
      recentCollections,
    });

  } catch (error) {
    res.status(500).json({ message: 'Porter dashboard stats failed', error: error.message });
  }
};
