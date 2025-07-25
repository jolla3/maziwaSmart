const {Breed,Cow} = require('../models/model');

// Create a new breed
exports.createBreed = async (req, res) => {
  try {
    const farmerId = req.user._id || req.user.id; // Extract from token

    if (!farmerId) {
      return res.status(401).json({ message: 'Farmer ID not found in token' });
    }

    const { breed_name, description } = req.body;

    const newBreed = new Breed({
      breed_name,
      description,
      farmer_id: farmerId // ✅ important!
    });

    await newBreed.save();

    res.status(201).json({ message: "Breed created successfully", breed: newBreed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating breed", error: error.message });
  }
};



exports.getBreeds = async (req, res) => {
  try {
    const farmer_id = req.user.id; // ⬅ FIXED
    console.log("Fetching breeds for farmer:", farmer_id);

    const breeds = await Breed.find({ farmer_id });
    console.log("Found breeds:", breeds);

    res.status(200).json({ breeds });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch breeds', error: error.message });
  }
};


// Update a breed
// Toggle breed active status (activate/deactivate)
exports.toggleBreedStatus = async (req, res) => {
  try {
    const farmer_code = req.user.farmer_code; // from JWT
    const cowId = req.params.id; // from URL

    console.log("Toggle request - Farmer Code:", farmer_code);
    console.log("Toggle request - Cow ID:", cowId);

    // Find the cow that belongs to the logged-in farmer
    const cow = await Cow.findOne({ _id: cowId, farmer_code });

    if (!cow) {
      return res.status(404).json({ message: "Cow not found or unauthorized" });
    }

    // Toggle the cow's status
    cow.is_active = !cow.is_active;
    await cow.save();

    res.status(200).json({
      message: `Cow has been ${cow.is_active ? 'reactivated' : 'deactivated'} successfully.`,
      cow: {
        id: cow._id,
        name: cow.cow_name,
        is_active: cow.is_active
      }
    });
  } catch (error) {
    console.error("Toggle error:", error);
    res.status(500).json({ message: 'Failed to update cow status', error: error.message });
  }
};