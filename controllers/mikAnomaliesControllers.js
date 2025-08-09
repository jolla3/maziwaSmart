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
// controllers/milkController.js
const { MilkRecord } = require('../models'); // adjust import path

exports.getDailyMilkSummaryForAdmin = async (req, res) => {
  try {
    const { date } = req.query; // optional ?date=YYYY-MM-DD
    const targetDate = date ? new Date(date) : new Date();

    // Normalize to start of the day
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const summaries = await MilkRecord.aggregate([
      {
        $match: {
          collection_date: { $gte: startOfDay, $lt: endOfDay }
        }
      },
      // Join porter info
      {
        $lookup: {
          from: 'porters',
          localField: 'created_by',
          foreignField: '_id',
          as: 'porter'
        }
      },
      { $unwind: '$porter' },
      // Join farmer info
      {
        $lookup: {
          from: 'farmers',
          localField: 'farmer',
          foreignField: '_id',
          as: 'farmer'
        }
      },
      { $unwind: '$farmer' },
      // Add order index for timeslot
      {
        $addFields: {
          timeSlotOrder: {
            $switch: {
              branches: [
                { case: { $eq: ['$time_slot', 'morning'] }, then: 1 },
                { case: { $eq: ['$time_slot', 'midmorning'] }, then: 2 },
                { case: { $eq: ['$time_slot', 'afternoon'] }, then: 3 }
              ],
              default: 99
            }
          }
        }
      },
      // Group by porter → timeslot → farmer
      {
        $group: {
          _id: {
            porter_id: '$porter._id',
            porter_name: '$porter.name',
            time_slot: '$time_slot',
            farmer_code: '$farmer_code',
            farmer_name: '$farmer.fullname'
          },
          total_litres: { $sum: '$litres' }
        }
      },
      // Sort
      {
        $sort: {
          '_id.porter_name': 1,
          'timeSlotOrder': 1,
          '_id.farmer_code': 1
        }
      },
      // Regroup by porter → timeslot
      {
        $group: {
          _id: {
            porter_id: '$_id.porter_id',
            porter_name: '$_id.porter_name',
            time_slot: '$_id.time_slot'
          },
          farmers: {
            $push: {
              farmer_code: '$_id.farmer_code',
              farmer_name: '$_id.farmer_name',
              litres: '$total_litres'
            }
          },
          total_litres_slot: { $sum: '$total_litres' }
        }
      },
      // Sort by porter and timeslot order
      {
        $sort: {
          '_id.porter_name': 1,
          'timeSlotOrder': 1
        }
      },
      // Regroup by porter
      {
        $group: {
          _id: {
            porter_id: '$_id.porter_id',
            porter_name: '$_id.porter_name'
          },
          slots: {
            $push: {
              time_slot: '$_id.time_slot',
              farmers: '$farmers',
              total_litres_slot: '$total_litres_slot'
            }
          },
          total_litres_porter: { $sum: '$total_litres_slot' }
        }
      },
      // Final format
      {
        $project: {
          _id: 0,
          porter_id: '$_id.porter_id',
          porter_name: '$_id.porter_name',
          slots: 1,
          total_litres_porter: 1
        }
      }
    ]);

    res.json({
      date: startOfDay,
      summaries
    });

  } catch (error) {
    console.error('Error getting daily milk summary:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// module.exports = { getDailyMilkSummaryForAdmin };
