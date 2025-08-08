
// ============================
// CONTROLLER: controllers/porterController.js
// ============================

const bcrypt = require('bcrypt');


const { Porter,Farmer ,User,MilkRecord,PorterLog, DailyMilkSummary } = require('../models/model');

// Create Porter (only saves to Porter table, not User)
// controllers/milkController.js

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
      farmerMap[f.farmer_code] = f.fullname
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


// Get All Porters
exports.getAllPorters = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const porters = await Porter.find({ created_by: adminId });
    res.json({ porters });
  } catch (error) {
    res.json({ message: 'Error retrieving porters', error: error.message });
  }
};

// Get Single Porter by ID
exports.getPorterById = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const porter = await Porter.findOne({ _id: req.params.id, created_by: adminId });

    if (!porter) {
      return res.json({ message: 'Porter not found or you are not authorized' });
    }

    res.json({ porter });
  } catch (error) {
    res.json({ message: 'Error retrieving porter', error: error.message });
  }
};

// Update Porter

// ✅ Update Porter (Only Admin OR the Porter himself)
exports.updatePorter = async (req, res) => {
  try {
    const requesterId = req.user.userId;        // from JWT
    const requesterRole = req.user.role;        // from JWT
    const updatedData = req.body;

    let porterId;

    // Admin updates any porter using params
if (requesterRole === 'admin') {
  porterId = req.params.id;

  const porter = await Porter.findOne({ _id: porterId, created_by: requesterId });
  if (!porter) {
    return res.json({ message: 'Not authorized to update this porter' });
  }

  if (updatedData.password) {
    return res.json({ message: 'Admins cannot update porter passwords' });
  }

  const updatedPorter = await Porter.findByIdAndUpdate(porterId, updatedData, { new: true });

  return res.json({
    message: 'Admin updated porter successfully',
    porter: updatedPorter
  });



    } else {
      return res.json({ message: 'Access denied: Invalid role' });
    }

    // Proceed to update
    const porter = await Porter.findById(porterId);
    if (!porter) return res.json({ message: 'Porter not found' });

    const updatedPorter = await Porter.findByIdAndUpdate(porterId, updatedData, { new: true });

    res.json({
      message: `${requesterRole === 'admin' ? 'Admin updated porter' : 'Porter updated profile'} successfully`,
      porter: updatedPorter
    });

  } catch (error) {
    console.error(error);
    res.json({ message: 'Update failed', error: error.message });
  }
}

// Delete Porter
exports.deletePorter = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const porterId = req.params.id;

    const porter = await Porter.findOne({ _id: porterId, created_by: adminId });
    if (!porter) {
      return res.json({ message: "Not authorized to delete this porter" });
    }

    await Porter.findByIdAndDelete(porterId);

    await MilkRecord.updateMany(
      { porter_code: porter._id },
      { $set: { porter_code: null } }
    );

    await PorterLog.updateMany(
      { porter_id: porter._id },
      { $set: { porter_id: null } }
    );

    res.json({ message: `Porter ${porter.name} deleted successfully` });
  } catch (error) {
    res.json({ message: error.message });
  }
};
