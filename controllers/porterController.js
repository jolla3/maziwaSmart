
// ============================
// CONTROLLER: controllers/porterController.js
// ============================

const bcrypt = require('bcrypt');


const { Porter,Farmer ,User,MilkRecord,PorterLog, DailyMilkSummary } = require('../models/model');

// Create Porter (only saves to Porter table, not User)
// controllers/milkController.js

exports.addMilkRecord = async (req, res) => {
  try {
    if (req.user.role !== 'porter') {
      return res.status(403).json({ message: 'Only porters can add milk records' });
    }

    const { farmer_code, litres } = req.body;

    // Check farmer exists
    const farmer = await Farmer.findOne({ farmer_code });
    if (!farmer) {
      return res.status(404).json({ message: 'Farmer not found' });
    }

    // Determine time slot
    const now = new Date();
    const hour = now.getHours();
    let time_slot = '';
    if (hour < 10) time_slot = 'morning';
    else if (hour < 15) time_slot = 'midmorning';
    else time_slot = 'afternoon';

    // Calculate date range for today
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const endOfDay = new Date(now.setHours(23, 59, 59, 999));

    // Prevent duplicates for the same farmer/porter/slot/day
    const exists = await MilkRecord.findOne({
      created_by: req.user.id,
      farmer_code,
      time_slot,
      collection_date: { $gte: startOfDay, $lte: endOfDay }
    });

    if (exists) {
      return res.status(400).json({
        message: 'Milk already collected for this farmer in this time slot today'
      });
    }

    // 1. Save raw Milk Record
    const newRecord = await MilkRecord.create({
      created_by: req.user.id,
      farmer_code,
      litres,
      collection_date: new Date(),
      time_slot
    });

    // 2. Log porter activity
    await PorterLog.create({
      porter_id: req.user.id,
      porter_name: req.user.name,
      activity_type: 'collection',
      log_date: new Date(),
      litres_collected: litres,
      remarks: `Collected milk from farmer ${farmer.fullname} (${farmer_code}) during ${time_slot}`
    });

    // 3. Update (or insert) DailyMilkSummary
    await DailyMilkSummary.findOneAndUpdate(
      {
        summary_date: startOfDay,
        porter_id: req.user.id,
        farmer_code,
        time_slot
      },
      {
        $setOnInsert: {
          porter_name: req.user.name,
          summary_date: startOfDay,
          porter_id: req.user.id,
          farmer_code,
          time_slot
        },
        $inc: {
          total_litres: litres
        }
      },
      { upsert: true, new: true }
    );

    // ✅ Summary now has litres per farmer per slot
    // Grouping & subtotals will be handled during fetch

    res.status(201).json({
      message: 'Milk record added, activity logged, summary updated',
      record: newRecord
    });

  } catch (error) {
    console.error('Error adding milk record:', error);
    res.status(500).json({
      message: 'Failed to add milk record',
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
