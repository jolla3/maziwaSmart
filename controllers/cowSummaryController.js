const moment = require("moment");
const { CowMilkRecord } = require("../models/model");

exports.getFarmerMilkSummary = async (req, res) => {
  try {
    const farmerCode = Number(req.user.code);

    const startOfYear = moment().startOf("year").toDate();
    const endOfYear = moment().endOf("year").toDate();

    const summary = await CowMilkRecord.aggregate([
      // 1️⃣ Farmer + time range
      {
        $match: {
          farmer_code: farmerCode,
          collection_date: { $gte: startOfYear, $lte: endOfYear }
        }
      },

      // 2️⃣ Attach animal metadata
      {
        $lookup: {
          from: "cows",
          localField: "animal_id",
          foreignField: "_id",
          as: "animal"
        }
      },
      { $unwind: "$animal" },

      // 3️⃣ Time buckets
      {
        $addFields: {
          year: { $year: "$collection_date" },
          month: { $month: "$collection_date" },
          week: { $isoWeek: "$collection_date" }
        }
      },

      // 4️⃣ Per-animal per-period aggregation
      {
        $group: {
          _id: {
            animal_id: "$animal_id",
            animal_name: "$cow_name",
            species: "$animal.species",
            year: "$year",
            month: "$month",
            week: "$week"
          },
          total_litres: { $sum: "$litres" }
        }
      },

      // 5️⃣ Animal-level totals
      {
        $group: {
          _id: "$_id.animal_id",
          animal_name: { $first: "$_id.animal_name" },
          species: { $first: "$_id.species" },

          yearly_total: { $sum: "$total_litres" },

          monthly: {
            $push: {
              year: "$_id.year",
              month: "$_id.month",
              litres: "$total_litres"
            }
          },

          weekly: {
            $push: {
              year: "$_id.year",
              week: "$_id.week",
              litres: "$total_litres"
            }
          }
        }
      },

      // 6️⃣ Grand totals
      {
        $group: {
          _id: null,
          animals: { $push: "$$ROOT" },
          farm_year_total: { $sum: "$yearly_total" }
        }
      }
    ]);

    if (!summary.length) {
      return res.status(200).json({
        message: "No milk records found for this farmer.",
        animals: [],
        farm_year_total: 0
      });
    }

    return res.status(200).json({
      message: "Milk production summary generated.",
      year: moment().year(),
      animals: summary[0].animals,
      farm_year_total: summary[0].farm_year_total
    });

  } catch (err) {
    console.error("Milk summary error:", err);
    return res.status(500).json({
      message: "Failed to generate milk summary",
      error: err.message
    });
  }
};
