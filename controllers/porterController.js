
// ============================
// CONTROLLER: controllers/porterController.js
// ============================

const bcrypt = require('bcrypt');


const { Porter ,User,MilkRecord,PorterLog } = require('../models/model');

// Create Porter (only saves to Porter table, not User)

exports.createPorter = async (req, res) => {
  try {
    const { name, phone,email, assigned_route } = req.body;
    const adminId = req.user.id;

     const nameExists = await Porter.findOne({ name });
        if (nameExists) {
        return res.json({ message: `A porter with this ${name} already exists` });
        }

     const emailExists = await Porter.findOne({ email });
    if (emailExists) {
      return res.json({ message: 'A porter with this email already exists' });
    }


    // Optional duplicate phone check
    const phoneExists = await Porter.findOne({ phone })
    if (phoneExists) {
      return res.json({ message: 'Porter with that phone already exists' });
    }
    const difpassword="12345678"
      const password= await bcrypt.hash(difpassword,10)
    const newPorter = new Porter({
      name,
      phone,
      email,
      password,
      assigned_route,
      created_by: adminId,
      is_active: true,
    });

    // // Optional: Update farmer to link manager
    // await Porter.findByIdAndUpdate(
    //   adminId,
    //   { $push: {: newPorter._id } },
    //   { new: true }
    // );


    await newPorter.save();

    // Optional: Update farmer to link manager
    await User.findByIdAndUpdate(
      adminId,
      { $set: { porters: newPorter._id } },
      { new: true }
    );


    res.json({
      message: 'Porter created successfully',
      porter: {
        id: newPorter._id,
        name: newPorter.name,
        phone: newPorter.phone,
        assigned_route: newPorter.assigned_route,
        created_by: adminId
      }
    });
  } catch (error) {
    console.error(error);
    res.json({ message: 'Failed to create porter', error: error.message });
  }
};

// Get All Porters with pagination and search
exports.getAllPorters = async (req, res) => {
  try {
    const adminId = req.user.id;

    const page = parseInt(req.query.page) || 1; // pages start from 1
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const query = {
      created_by: adminId,
      name: { $regex: search, $options: "i" }, // case-insensitive search by name
    };

    const totalCount = await Porter.countDocuments(query);

    const porters = await Porter.find(query)
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      porters,
      totalCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving porters', error: error.message });
  }
};


// Get Single Porter by ID
exports.getPorterById = async (req, res) => {
  try {
    const adminId = req.user.id;
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
    const requesterId = req.user.id;        // from JWT
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
    const adminId = req.user.id;
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
