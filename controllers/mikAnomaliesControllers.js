const {  User,
  Farmer,
  Manager,
  Porter,
  PorterLog, 
  Breed,
  Cow,
  MilkRecord,
  DailyMilkSummary,
  Insemination,
  VetLog,
  MilkAnomaly} = require('../models/model');
// const  = require('../models/MilkAnomaly');



exports.getDailyMilkSummaryForAdmin = async (req, res) => {
  try {
    const queryDate = req.query.date ? new Date(req.query.date) : new Date();
    const startOfDay = new Date(queryDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(queryDate.setHours(23, 59, 59, 999));

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

    // Get all farmer names
    const farmers = await Farmer.find().lean();
    const farmerMap = {};
    farmers.forEach(f => {
      farmerMap[f.farmer_code] = f.fullname;
    });

    // Get porter names by ID
    const porterIds = [...new Set(summaries.map(s => s.porter_id.toString()))];
    const porters = await Porter.find({ _id: { $in: porterIds } }).lean();
    const porterMap = {};
    porters.forEach(p => {
      porterMap[p._id.toString()] = p.name
    })

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
          porter_name: porterMap[porterId] || 'Unknown Porter',
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
