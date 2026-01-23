const moment = require("moment-timezone");
const { CowMilkRecord } = require("../models/model");

exports.getFarmerMilkIntelligence = async (req, res) => {
  try {
    const farmerCode = Number(req.user.code);

    const queryYear = Number(req.query.year);
    const queryMonth = req.query.month ? Number(req.query.month) : null; // 1–12
    const queryDay = req.query.day ? Number(req.query.day) : null;

    // Determine start/end
    let start, end;

    if (queryYear && !queryMonth && !queryDay) {
      start = moment.tz({ year: queryYear }, "Africa/Nairobi").startOf("year");
      end = start.clone().endOf("year");
    } else if (queryYear && queryMonth && !queryDay) {
      start = moment.tz({ year: queryYear, month: queryMonth - 1 }, "Africa/Nairobi").startOf("month");
      end = start.clone().endOf("month");
    } else if (queryYear && queryMonth && queryDay) {
      start = moment.tz({ year: queryYear, month: queryMonth - 1, day: queryDay }, "Africa/Nairobi").startOf("day");
      end = start.clone().endOf("day");
    } else {
      // Default: today
      start = moment.tz("Africa/Nairobi").startOf("day");
      end = moment(start).endOf("day");
    }

    // Mongo aggregation pipeline
    const pipeline = [
      {
        $match: {
          farmer_code: farmerCode,
          collection_date: { $gte: start.toDate(), $lte: end.toDate() }
        }
      },
      {
        $lookup: {
          from: "cows",
          localField: "animal_id",
          foreignField: "_id",
          as: "animal"
        }
      },
      { $unwind: "$animal" },
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
          total: { $sum: "$litres" }
        }
      }
    ];

    const animalsRaw = await CowMilkRecord.aggregate(pipeline);

    const STAGE_ORDER = ["early_morning", "morning", "midday", "afternoon", "evening", "night"];

    const animals = animalsRaw.map(animal => {
      const stageMap = Object.fromEntries(animal.rawStages.map(s => [s.stage, s.litres]));
      const stages = STAGE_ORDER.map(stage => ({ stage, litres: stageMap[stage] || 0 }));

      return {
        animal_id: animal._id,
        animal_name: animal.animal_name,
        species: animal.species,
        stages,
        daily_total: animal.total,
        weekly_total: animal.total,
        monthly_total: animal.total,
        yearly_total: animal.total
      };
    });

    const farmTotals = animals.reduce(
      (acc, a) => {
        acc.daily += a.daily_total;
        acc.weekly += a.weekly_total;
        acc.monthly += a.monthly_total;
        acc.yearly += a.yearly_total;
        return acc;
      },
      { daily: 0, weekly: 0, monthly: 0, yearly: 0 }
    );

    // HUMAN PERIOD: derive from the **real start date**
    const periodMoment = start.clone();
    const period = {
      year: periodMoment.format("YYYY"),
      month: periodMoment.format("MMMM"),
      month_number: periodMoment.format("MM"),
      day: periodMoment.format("dddd, MMMM Do YYYY"),
      week: `Week ${periodMoment.isoWeek()}`
    };

    return res.status(200).json({
      message: "Milk intelligence loaded.",
      period,
      animals,
      totals: farmTotals
    });

  } catch (err) {
    console.error("Milk intelligence error:", err);
    return res.status(500).json({
      message: "Failed to load milk intelligence",
      error: err.message
    });
  }
};
