const {Manager,Farmer} = require('../models/model');

// controller/manager.js

exports.addManager = async (req, res) => {
  try {

    const { name, email, phone } = req.body
    console.log(name, email, phone);
    const farmer_code = req.user.farmer_code;
    const farmerId = req.user.id

    const existing = await Manager.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Manager already exists' });

    const newManager = new Manager({
      name,
      email,
      phone,
      farmer_code,
      farmer: farmerId
    });

    await newManager.save(); // ✅ VERY IMPORTANT

    // Optional: Update farmer to link manager
    await Farmer.findByIdAndUpdate(
      farmerId,
      { $push: { managers: newManager._id } },
      { new: true }
    );

     res.status(201).json({ message: 'Manager created', manager: newManager });
  } catch (err) {
     res.status(500).json({ message: 'Error creating manager', error: err.message });
  }
}



// Get all managers for a farmer
exports.getManagers = async (req, res) => {
  try {
    const farmer_code = req.user.farmer_code
    const managers = await Manager.find({ farmer_code });
    res.status(200).json(managers);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch managers', error: error.message });
  }
};

// Get single manager by ID
exports.getManagerById = async (req, res) => {
  try {
    const manager = await Manager.findById(req.params.id);
    if (!manager) return res.status(404).json({ message: 'Manager not found' });
    res.status(200).json(manager);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch manager', error: error.message });
  }
};

// Update manager
exports.updateManager = async (req, res) => {
  try {
    const updated = await Manager.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Manager not found' });
    res.status(200).json({ message: 'Manager updated', manager: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update manager', error: error.message });
  }
};

// Delete manager
exports.deleteManager = async (req, res) => {
  try {
    const manager = await Manager.findById(req.params.id);

    if (!manager) {
      return res.status(404).json({ message: 'Manager not found' });
    }

    // Remove reference from the farmer, if it exists
    if (manager.farmer) {
      await Farmer.findByIdAndUpdate(manager.farmer, {
        $unset: { manager: "" } // Remove manager field from farmer
      });
    }

    // Delete the manager
    await Manager.findByIdAndDelete(req.params.id);

    res.status(200).json({ message: 'Manager and related reference deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete manager', error: error.message });
  }
};