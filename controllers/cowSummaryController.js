const moment = require("moment");
const { CowMilkRecord } = require("../models/model");

exports.getFarmerMilkSummary = async (req, res) => {
  try {
    const farmerCode = Number(req.user.code);

    const year = Number(req.query.year) || moment().year();
    const month = req.query.month ? Number(req.query.month) : null; // 1–12

    const start = month
      ? moment({ year, month: month - 1 }).startOf("month").toDate()
      : moment({ year }).startOf("year").toDate();

    const end = month
      ? moment({ year, month: month - 1 }).endOf("month").toDate()
      : moment({ year }).endOf("year").toDate();

    const data = await CowMilkRecord.aggregate([
      // 1️⃣ Filter
      {
        $match: {
          farmer_code: farmerCode,
          collection_date: { $gte: start, $lte: end }
        }
      },

      // 2️⃣ Join animal
      {
        $lookup: {
          from: "cows",
          localField: "animal_id",
          foreignField: "_id",
          as: "animal"
        }
      },
      { $unwind: "$animal" },

      // 3️⃣ Time fields
      {
        $addFields: {
          year: { $year: "$collection_date" },
          month: { $month: "$collection_date" },
          month_name: {
            $dateToString: { format: "%B", date: "$collection_date" }
          }
        }
      },

      // 4️⃣ Per-animal + stage aggregation
      {
        $group: {
          _id: {
            animal_id: "$animal_id",
            animal_name: "$cow_name",
            species: "$animal.species",
            month: "$month",
            month_name: "$month_name",
            stage: "$time_slot"
          },
          litres: { $sum: "$litres" }
        }
      },

      // 5️⃣ Per-animal monthly summary
      {
        $group: {
          _id: {
            animal_id: "$_id.animal_id",
            animal_name: "$_id.animal_name",
            species: "$_id.species",
            month: "$_id.month",
            month_name: "$_id.month_name"
          },
          stage_totals: {
            $push: {
              stage: "$_id.stage",
              litres: "$litres"
            }
          },
          monthly_total: { $sum: "$litres" }
        }
      },

      // 6️⃣ Animal rollup
      {
        $group: {
          _id: "$_id.animal_id",
          animal_name: { $first: "$_id.animal_name" },
          species: { $first: "$_id.species" },
          months: {
            $push: {
              month: "$_id.month",
              month_name: "$_id.month_name",
              total_litres: "$monthly_total",
              stages: "$stage_totals"
            }
          },
          animal_total: { $sum: "$monthly_total" }
        }
      },

      // 7️⃣ Farm totals
      {
        $group: {
          _id: null,
          animals: { $push: "$$ROOT" },
          farm_total_litres: { $sum: "$animal_total" }
        }
      }
    ]);

    if (!data.length) {
      return res.status(200).json({
        message: "No milk records found.",
        year,
        animals: [],
        farm_total_litres: 0
      });
    }

    return res.status(200).json({
      message: "Milk summary generated successfully.",
      year,
      month: month ? moment().month(month - 1).format("MMMM") : "All Months",
      animals: data[0].animals,
      farm_total_litres: data[0].farm_total_litres
    });

  } catch (err) {
    console.error("Milk summary error:", err);
    return res.status(500).json({
      message: "Failed to fetch milk summary",
      error: err.message
    });
  }
};
