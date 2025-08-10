// // ============================
// // CONTROLLER: controllers/farmerController.js
// // ============================


const { Farmer, User ,MilkAnomalities,MilkRecord,Notification,AdviceMessages} = require('../models/model');
const bcrypt = require('bcrypt');



// ================================
// Create Farmer
// ================================
exports.createFarmer = async (req, res) => {
  try {
    const { fullname, phone, location, email,farmer_code } = req.body;
    const adminId = req.user.userId; // ID from JWT token

    // Check for duplicate email
    const emailExists = await Farmer.findOne({ farmer_code });
    if (emailExists) {
      return res.json({ message: 'A farmer with this Code already exists' });
    }
   const difpassword="12345678"
         const password= await bcrypt.hash(difpassword,10)
    const newFarmer = new Farmer({
      fullname,
      phone,
      email,
      password,
      farmer_code,
      location,
      created_by: adminId
    });

    await newFarmer.save();
    // Optional: Update farmer to link manager
    await User.findByIdAndUpdate(
      adminId,
      { $push: { farmer: newFarmer._id } },
      { new: true }
    );


    res.json({
      message: 'Farmer profile created successfully',
      farmer: {
        id: newFarmer._id,
        fullname: newFarmer.fullname,
        email: newFarmer.email,
        phone: newFarmer.phone,
        location: newFarmer.location,
        created_by: newFarmer.created_by
      }
    });
  } catch (error) {
    console.error(error);
    res.json({ message: 'Failed to create farmer', error: error.message });
  }
};
              

// ==============================
// GET all farmers created by this admin
// ==============================
exports.getAllFarmers = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    // Filter object
    const filter = {
      created_by: adminId,
      fullname: { $regex: search, $options: "i" }
    };

    const total = await Farmer.countDocuments(filter);

    const farmers = await Farmer.find(filter)
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ farmers, total });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch farmers", error: err.message });
  }
};

// ==============================
// GET single farmer by code (admin must have created them)
// ==============================
exports.getFarmerByCode = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const farmer = await Farmer.findOne({
      farmer_code: req.params.code,
      created_by: adminId
    });

    if (!farmer) return res.json({ message: 'Farmer not found or not yours' });
    res.json(farmer);
  } catch (err) {
    res.json({ message: 'Failed to fetch farmer' });
  }
};

// ==============================
// UPDATE farmer (only the admin who created the farmer OR the farmer themself)
// ==============================
exports.updateFarmer = async (req, res) => {
  try {
    const userIdFromToken = req.user.userId;
    const role = req.user.role;
    const farmerIdFromParams = req.params.id;
    const updatedData = req.body;

    let farmerId;

    if (role === 'farmer') {
      const user = await User.findById(userIdFromToken);
      if (!user || !user.farmer) {
        return res.json({ message: 'Farmer profile not linked to user' });
      }
      farmerId = user.farmer.toString();
    } else if (role === 'admin') {
      // Ensure the farmer being updated was created by this admin
      const farmer = await Farmer.findOne({ _id: farmerIdFromParams, created_by: userIdFromToken });
      if (!farmer) {
        return res.json({ message: 'You are not authorized to update this farmer' });
      }
      farmerId = farmer._id;
    } else {
      return res.json({ message: 'Unauthorized role' });
    }

    // Restrict password update by admin
    if (updatedData.password && role === 'admin') {
      return res.json({ message: 'Admins cannot change farmer passwords' });
    }

    // Hash new password if farmer is updating it
    if (updatedData.password) {
      const hashedPassword = await bcrypt.hash(updatedData.password, 10);
      updatedData.password = hashedPassword;
    }

    const updatedFarmer = await Farmer.findByIdAndUpdate(farmerId, updatedData, { new: true });

    res.json({
      message: 'Farmer profile updated successfully',
      farmer: updatedFarmer
    });

  } catch (error) {
    console.error(error);
    res.json({ message: 'Update failed', error: error.message });
  }
};

// ==============================
// DELETE farmer (only if admin created them)
// ==============================
exports.deleteFarmer = async (req, res) => {
  try {
    const adminId = req.user.userId;

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
