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
    const emailExists = await Farmer.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ message: 'A farmer with this email already exists' });
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


    res.status(201).json({
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
    res.status(500).json({ message: 'Failed to create farmer', error: error.message });
  }
};
              
exports.getAllFarmers = async (req, res) => {
   try {
     const farmers = await Farmer.find();
     res.status(200).json(farmers);
   } catch (err) {
     res.status(500).json({ message: 'Failed to fetch farmers' });
   }
 };

exports.getFarmerByCode = async (req, res) => {
   try {
     const farmer = await Farmer.findOne({ farmer_code: req.params.code });
     if (!farmer) return res.status(404).json({ message: 'Farmer not found' });
     res.status(200).json(farmer);
   } catch (err) {
     res.status(500).json({ message: 'Failed to fetch farmer' });
   }
 }



//  update farmer
exports.updateFarmer = async (req, res) => {
  try {
    const userIdFromToken = req.user.userId;
    const role = req.user.role;
    const farmerIdFromParams = req.params.id;
    const updatedData = req.body;

    let farmerId;

    // 🔐 Step 1: Decide which farmer ID to update
    if (role === 'farmer') {
      const user = await User.findById(userIdFromToken);
      if (!user || !user.farmer) {
        return res.status(404).json({ message: 'Farmer profile not linked to user' });
      }
      farmerId = user.farmer.toString();
    } else if (role === 'admin') {
      farmerId = farmerIdFromParams;
    } else {
      return res.status(403).json({ message: 'Unauthorized role' });
    }

    // ✅ Step 2: Get the farmer document
    const farmer = await Farmer.findById(farmerId);
    if (!farmer) {
      return res.status(404).json({ message: 'Farmer not found' });
    }

    // 🔒 Step 3: Prevent admin from changing passwords
    if (updatedData.password && role === 'admin') {
      return res.status(403).json({ message: 'Admins cannot change farmer passwords' });
    }

    // 🔐 Step 4: Hash password if provided by farmer
    if (updatedData.password) {
      const hashedPassword = await bcrypt.hash(updatedData.password, 10);
      updatedData.password = hashedPassword;
    }

    // ✅ Step 5: Update farmer
    const updatedFarmer = await Farmer.findByIdAndUpdate(farmerId, updatedData, { new: true });

    res.status(200).json({
      message: 'Farmer profile updated successfully',
      farmer: updatedFarmer
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Update failed', error: error.message });
  }
}


exports.deleteFarmer = async (req, res) => {
  try {
    const deletedFarmer = await Farmer.findOneAndDelete({ farmer_code: req.params.code });

    if (!deletedFarmer) {
      return res.status(404).json({ message: 'Farmer not found' });
    }

    console.log("✅ Deleted farmer:", deletedFarmer);

    // Optional: fallback name if undefined
    const name = deletedFarmer.fullname || deletedFarmer.name || '[No Name]';

    // Update related collections
    await MilkRecord.updateMany(
      { farmer_code: deletedFarmer.farmer_code },
      { $set: { farmer_code: null } }
    );

    // await MilkAnomalities.updateMany(
    //   { farmer_code: deletedFarmer.farmer_code },
    //   { $set: { farmer_code: null } }
    // );

    await Notification.updateMany(
      { farmer_code: deletedFarmer.farmer_code },
      { $set: { farmer_code: null } }
    );

    // Advice messages if needed
    // await AdviceMessages.updateMany(...);

    res.json({ message: `Farmer ${name} deleted successfully` });

  } catch (error) {
    console.error("❌ Error deleting farmer:", error);
    res.status(500).json({ message: 'Failed to delete farmer', error: error.message });
  }
};


