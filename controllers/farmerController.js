// // ============================
// // CONTROLLER: controllers/farmerController.js
// // ============================


const { Farmer, User ,MilkAnomalities,MilkRecord,Notification,AdviceMessages} = require('../models/model');
const bcrypt = require('bcrypt');


// ==============================
// CREATE farmer (admin only)
// ==============================
exports.createFarmer = async (req, res) => {
  try {
    const { fullname, phone, farmer_code, location_description } = req.body;
    const adminId = req.user.id || req.user._id;

    // Ensure farmer_code is unique
    const exists = await Farmer.findOne({ farmer_code });
    if (exists) {
      return res.status(400).json({ message: "A farmer with this code already exists" });
    }

    const newFarmer = new Farmer({
      fullname,
      phone,
      farmer_code,
      location_description,
      created_by: adminId
    });

    await newFarmer.save();

    res.status(201).json({
      message: "Farmer profile created successfully",
      farmer: {
        id: newFarmer._id,
        fullname: newFarmer.fullname,
        phone: newFarmer.phone,
        farmer_code: newFarmer.farmer_code,
        location_description: newFarmer.location_description,
        created_by: newFarmer.created_by
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create farmer", error: error.message });
  }
};

// ==============================
// GET all farmers created by this admin (with pagination + search)
// ==============================
exports.getAllFarmers = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const filter = {
      created_by: adminId,
      fullname: { $regex: search, $options: "i" }
    };

    const total = await Farmer.countDocuments(filter);

    const farmers = await Farmer.find(filter)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ created_at: -1 });

    res.json({
      farmers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch farmers", error: err.message });
  }
};

// ==============================
// GET single farmer by code
// ==============================
exports.getFarmerByCode = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const farmer = await Farmer.findOne({
      farmer_code: req.params.code,
      created_by: adminId
    });

    if (!farmer) {
      return res.status(404).json({ message: "Farmer not found or not yours" });
    }

    res.json(farmer);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch farmer", error: err.message });
  }
};

// ==============================
// UPDATE farmer (admin only for their farmers)
// ==============================
exports.updateFarmer = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const farmerId = req.params.id;

    // Verify farmer belongs to this admin
    const farmer = await Farmer.findOne({ _id: farmerId, created_by: adminId });
    if (!farmer) {
      return res.status(403).json({ message: "You are not authorized to update this farmer" });
    }

    const updatedFarmer = await Farmer.findByIdAndUpdate(
      farmerId,
      req.body,
      { new: true }
    );

    res.json({
      message: "Farmer profile updated successfully",
      farmer: updatedFarmer
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Update failed", error: error.message });
  }
};

// ==============================
// DELETE farmer (only if admin created them)
// ==============================
exports.deleteFarmer = async (req, res) => {
  try {
    const adminId = req.user.id;

    const farmer = await Farmer.findOne({
      farmer_code: req.params.code,
      created_by: adminId
    });

    if (!farmer) {
      return res.json({ message: 'Farmer not found or not authorized to delete' });
    }

    const deletedFarmer = await Farmer.findByIdAndDelete(farmer._id);

    // Clean up related records
    await MilkRecord.updateMany(
      { farmer_code: deletedFarmer.farmer_code },
      { $set: { farmer_code: null } }
    );

    await Notification.updateMany(
      { farmer_code: deletedFarmer.farmer_code },
      { $set: { farmer_code: null } }
    );

    const name = deletedFarmer.fullname || deletedFarmer.name || '[No Name]';
    res.json({ message: `Farmer ${name} deleted successfully` });

  } catch (error) {
    console.error("❌ Error deleting farmer:", error);
    res.json({ message: 'Failed to delete farmer', error: error.message });
  }
};
