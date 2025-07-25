const {MilkRecord,MilkAnomaly} = require('../models/model');
// const  = require('../models/MilkAnomaly');

exports.addMilkRecord = async (req, res) => {
  try {
    const { farmer_code, porter_code, litres, collection_date, time_slot } = req.body;

    // Save the new milk record
    const newRecord = await MilkRecord.create({
      farmer_code,
      porter_code,
      litres,
      collection_date,
      time_slot
    });

    // Get previous 3 milk records for this farmer
    const recentRecords = await MilkRecord.find({ farmer_code })
      .sort({ collection_date: -1 })
      .limit(3);

    if (recentRecords.length > 0) {
      const total = recentRecords.reduce((sum, r) => sum + r.litres, 0);
      const average = total / recentRecords.length;

      const changePercent = Math.abs((litres - average) / average) * 100;

      if (changePercent >= 30) {
        // Log anomaly
        await MilkAnomaly.create({
          farmer_code,
          anomaly_date: collection_date,
          anomaly_type: litres > average ? 'Increase' : 'Decrease',
          description: `Milk litres changed by ${changePercent.toFixed(1)}% from average (${average.toFixed(1)}L)`
        });
      }
    }

    res.status(201).json({ message: 'Milk record saved', newRecord });

  } catch (error) {
    res.status(500).json({ message: 'Failed to save milk record', error: error.message });
  }
};
