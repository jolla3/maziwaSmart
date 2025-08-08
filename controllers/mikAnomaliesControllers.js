const {MilkRecord,MilkAnomaly, Farmer, Porter,DailyMilkSummary,MilkAnomaly,MilkRecord,getDailyMilkSummaryForAdmin,} = require('../models/model');
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


exports.getDailyMilkSummaryForAdmin = async (req, res) => {
  try {
    // Parse ?date=YYYY-MM-DD or use today
    const queryDate = req.query.date ? new Date(req.query.date) : new Date();
    const startOfDay = new Date(queryDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(queryDate.setHours(23, 59, 59, 999));

    // Fetch all milk summaries for the day
    const summaries = await DailyMilkSummary.find({
      summary_date: { $gte: startOfDay, $lte: endOfDay }
    }).lean();

    if (summaries.length === 0) {
      return res.status(200).json({
        message: 'No milk summaries found for this date',
        date: startOfDay.toISOString().split('T')[0],
        summaries: [],
        daily_total: 0
      });
    }

    // Fetch all farmer names for mapping
    const farmers = await Farmer.find().lean();
    const farmerMap = {};
    farmers.forEach(f => {
      farmerMap[f.farmer_code] = f.fullname;
    });

    // Group by porter → time slot → farmer
    const grouped = {};
    let dailyTotal = 0;

    for (const rec of summaries) {
      const porterId = rec.porter_id.toString();
      const slot = rec.time_slot;
      const farmerCode = rec.farmer_code;
      const litres = rec.total_litres;

      dailyTotal += litres;

      if (!grouped[porterId]) {
        grouped[porterId] = {
          porter_id: porterId,
          porter_name: rec.porter_name,
          slots: {}
        };
      }

      if (!grouped[porterId].slots[slot]) {
        grouped[porterId].slots[slot] = {
          time_slot: slot,
          total_litres: 0,
          farmers: []
        };
      }

      grouped[porterId].slots[slot].total_litres += litres;
      grouped[porterId].slots[slot].farmers.push({
        farmer_code: farmerCode,
        farmer_name: farmerMap[farmerCode] || 'Unknown Farmer',
        litres
      });
    }

    // Format final structure
    const final = Object.values(grouped).map(porter => ({
      porter_id: porter.porter_id,
      porter_name: porter.porter_name,
      slots: Object.values(porter.slots)
    }));

    res.status(200).json({
      message: 'Daily milk summary fetched successfully',
      date: startOfDay.toISOString().split('T')[0],
      summaries: final,
      daily_total: dailyTotal
    });

  } catch (error) {
    console.error('Error in admin summary:', error);
    res.status(500).json({
      message: 'Failed to fetch daily milk summary',
      error: error.message
    });
  }
};