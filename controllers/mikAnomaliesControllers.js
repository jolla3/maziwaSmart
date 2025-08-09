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

    // 1️⃣ Aggregate in MongoDB
    const aggregated = await DailyMilkSummary.aggregate([
      {
        $match: {
          summary_date: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        // Group by porter, slot, and farmer to avoid duplicates
        $group: {
          _id: {
            porter_id: "$porter_id",
            time_slot: "$time_slot",
            farmer_code: "$farmer_code"
          },
          litres: { $first: "$total_litres" }, // take first recorded value
          porter_name: { $first: "$porter_name" }
        }
      }
    ]);

    if (aggregated.length === 0) {
      return res.status(200).json({
        message: "No milk summaries found for this date",
        date: startOfDay.toISOString().split("T")[0],
        summaries: [],
        daily_total: 0
      });
    }

    // 2️⃣ Fetch farmer and porter names
    const farmerCodes = [...new Set(aggregated.map(a => a._id.farmer_code))];
    const porterIds = [...new Set(aggregated.map(a => a._id.porter_id.toString()))];

    const farmers = await Farmer.find({ farmer_code: { $in: farmerCodes } }).lean();
    const farmerMap = {};
    farmers.forEach(f => {
      farmerMap[f.farmer_code] = f.fullname;
    });

    const porters = await Porter.find({ _id: { $in: porterIds } }).lean();
    const porterMap = {};
    porters.forEach(p => {
      porterMap[p._id.toString()] = p.name;
    });

    // 3️⃣ Build response structure
    const grouped = {};
    let dailyTotal = 0;

    for (const rec of aggregated) {
      const porterId = rec._id.porter_id.toString();
      const slot = rec._id.time_slot;
      const farmerCode = rec._id.farmer_code;
      const litres = rec.litres;

      dailyTotal += litres;

      if (!grouped[porterId]) {
        grouped[porterId] = {
          porter_id: porterId,
          porter_name: porterMap[porterId] || rec.porter_name || "Unknown Porter",
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
        farmer_name: farmerMap[farmerCode] || "Unknown Farmer",
        litres
      });
    }

    const final = Object.values(grouped).map(porter => ({
      porter_id: porter.porter_id,
      porter_name: porter.porter_name,
      slots: Object.values(porter.slots)
    }));

    res.status(200).json({
      message: "Daily milk summary fetched successfully",
      date: startOfDay.toISOString().split("T")[0],
      summaries: final,
      daily_total: dailyTotal
    });

  } catch (error) {
    console.error("Error in admin summary:", error);
    res.status(500).json({
      message: "Failed to fetch daily milk summary",
      error: error.message
    });
  }
};
