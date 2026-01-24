const moment = require("moment-timezone");
const { CowMilkRecord } = require("../models/model");

exports.getFarmerMilkIntelligence = async (req, res) => {
  try {
    const farmerCode = Number(req.user.code);
    if (isNaN(farmerCode)) {
      console.warn(`Invalid farmer code attempt: ${req.user.code}`);
      return res.status(401).json({ message: "Invalid farmer code - must be a number" });
    }

    let queryYear, queryMonth, queryDay;

    if (req.query.year !== undefined) {
      queryYear = Number(req.query.year);
      if (isNaN(queryYear)) {
        console.warn(`Invalid year query: ${req.query.year}`);
        return res.status(400).json({ message: `Invalid year '${req.query.year}' - must be a number` });
      }
    }

    if (req.query.month !== undefined) {
      queryMonth = Number(req.query.month);
      if (isNaN(queryMonth)) {
        console.warn(`Invalid month query: ${req.query.month}`);
        return res.status(400).json({ message: `Invalid month '${req.query.month}' - must be a number` });
      }
    }

    if (req.query.day !== undefined) {
      queryDay = Number(req.query.day);
      if (isNaN(queryDay)) {
        console.warn(`Invalid day query: ${req.query.day}`);
        return res.status(400).json({ message: `Invalid day '${req.query.day}' - must be a number` });
      }
    }

    // Validate only if provided
    const currentYear = moment.tz("Africa/Nairobi").year();
    if (queryYear !== undefined && (!Number.isInteger(queryYear) || queryYear < 1900 || queryYear > currentYear + 1)) {
      console.warn(`Invalid year query: ${req.query.year} (range: 1900-${currentYear + 1})`);
      return res.status(400).json({ message: `Invalid year '${req.query.year}' - must be integer between 1900 and ${currentYear + 1}` });
    }
    if (queryMonth !== undefined && (!Number.isInteger(queryMonth) || queryMonth < 1 || queryMonth > 12)) {
      console.warn(`Invalid month query: ${req.query.month}`);
      return res.status(400).json({ message: `Invalid month '${req.query.month}' - must be integer 1-12` });
    }
    if (queryDay !== undefined && (!Number.isInteger(queryDay) || queryDay < 1 || queryDay > 31)) {
      console.warn(`Invalid day query: ${req.query.day}`);
      return res.status(400).json({ message: `Invalid day '${req.query.day}' - must be integer 1-31` });
    }

    // Determine start/end with validation
    let start, end, periodType;
    if (queryYear !== undefined && queryMonth === undefined && queryDay === undefined) {
      periodType = 'year';
      start = moment.tz({ year: queryYear }, "Africa/Nairobi").startOf("year");
      end = start.clone().endOf("year");
    } else if (queryYear !== undefined && queryMonth !== undefined && queryDay === undefined) {
      periodType = 'month';
      start = moment.tz({ year: queryYear, month: queryMonth - 1 }, "Africa/Nairobi").startOf("month");
      end = start.clone().endOf("month");
    } else if (queryYear !== undefined && queryMonth !== undefined && queryDay !== undefined) {
      periodType = 'day';
      start = moment.tz({ year: queryYear, month: queryMonth - 1, day: queryDay }, "Africa/Nairobi").startOf("day");
      end = start.clone().endOf("day");
      if (!start.isValid()) {
        console.warn(`Invalid specific date: ${queryYear}-${queryMonth}-${queryDay}`);
        return res.status(400).json({ message: `Invalid date ${queryYear}-${queryMonth}-${queryDay} (e.g., non-existent like Feb 30)` });
      }
    } else {
      periodType = 'day'; // Default: today
      start = moment.tz("Africa/Nairobi").startOf("day");
      end = start.clone().endOf("day");
    }

    // Mongo aggregation pipeline (with limit for scalability—tune as needed)
    const pipeline = [
      {
        $match: {
          farmer_code: farmerCode,
          collection_date: { $gte: start.toDate(), $lte: end.toDate() }
        }
      },
      {
        $lookup: {
          from: "cows", // Assume general 'animals' if multi-species; rename if needed
          localField: "animal_id",
          foreignField: "_id",
          as: "animal"
        }
      },
      { $unwind: { path: "$animal", preserveNullAndEmptyArrays: true } }, // Handle missing animals
      {
        $group: {
          _id: {
            animal_id: "$animal_id",
            animal_name: "$cow_name",
            species: "$animal.species",
            stage: "$time_slot"
          },
          litres: { $sum: "$litres" }
        }
      },
      {
        $group: {
          _id: "$_id.animal_id",
          animal_name: { $first: "$_id.animal_name" },
          species: { $first: "$_id.species" },
          rawStages: { $push: { stage: "$_id.stage", litres: "$litres" } },
          period_total: { $sum: "$litres" } // Single total for the queried period
        }
      },
      { $limit: 100 } // Cap results to prevent overload; paginate if needed
    ];

    const animalsRaw = await CowMilkRecord.aggregate(pipeline);

    if (animalsRaw.length === 0) {
      return res.status(200).json({
        message: "No milk records found for the specified period.",
        period: {},
        animals: [],
        totals: { period_total: 0 }
      });
    }

    const STAGE_ORDER = ["early_morning", "morning", "midday", "afternoon", "evening", "night"];

    const animals = animalsRaw.map(animal => {
      const stageMap = Object.fromEntries(animal.rawStages.map(s => [s.stage, s.litres]));
      const stages = STAGE_ORDER.map(stage => ({ stage, litres: stageMap[stage] || 0 }));

      return {
        animal_id: animal._id,
        animal_name: animal.animal_name || "Unknown",
        species: animal.species || "Unknown",
        stages,
        period_total: animal.period_total
      };
    });

    const farmTotals = animals.reduce((acc, a) => acc + a.period_total, 0);

    // HUMAN PERIOD: derive from the **real start date**
    const periodMoment = start.clone();
    const period = {
      year: periodMoment.format("YYYY"),
      month: periodMoment.format("MMMM"),
      month_number: periodMoment.format("MM"),
      day: periodType === 'day' ? periodMoment.format("dddd, MMMM Do YYYY") : null,
      week: `Week ${periodMoment.isoWeek()} of ${periodMoment.year()}`
    };

    return res.status(200).json({
      message: "Milk intelligence loaded.",
      period,
      animals,
      totals: { period_total: farmTotals, period_type: periodType }
    });

  } catch (err) {
    console.error("Milk intelligence error:", err);
    return res.status(500).json({
      message: "Failed to load milk intelligence - server error",
      error: err.message
    });
  }
};