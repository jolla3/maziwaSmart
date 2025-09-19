const {Breed,Cow} = require('../models/model');

// Create a new breed
// controllers/breedController.js

// ✅ Create a new breed
exports.createBreed = async (req, res) => {
  try {
    const farmerId = req.user._id;

    if (!farmerId) {
      return res.status(401).json({ message: "Farmer ID not found in token" });
    }

    const { breed_name, description, species } = req.body;

    if (!species) {
      return res.status(400).json({ message: "Species is required" });
    }

    // Check if breed already exists for this farmer + species
    const exists = await Breed.findOne({ farmer_id: farmerId, breed_name, species });
    if (exists) {
      return res.status(400).json({ message: `${breed_name} already exists for ${species}` });
    }

    const newBreed = new Breed({
      breed_name,
      description,
      species,
      farmer_id: farmerId
    });

    await newBreed.save();

    res.status(201).json({
      message: "✅ Breed created successfully",
      breed: {
        id: newBreed._id,
        breed_name: newBreed.breed_name,
        species: newBreed.species,
        description: newBreed.description
      }
    });
  } catch (error) {
    console.error("❌ Error creating breed:", error);
    res.status(500).json({ message: "Error creating breed", error: error.message });
  }
};

// ✅ Get all breeds for logged farmer
exports.getBreeds = async (req, res) => {
  try {
    const farmerId = req.user._id || req.user.id;
    const { species } = req.query; // 🔑 frontend passes species e.g. ?species=cow

    let query = { farmer_id: farmerId, is_active: true };
    if (species) query.species = species; // apply species filter only if provided

    const breeds = await Breed.find(query).sort({ breed_name: 1 });

    res.status(200).json({
      count: breeds.length,
      species: species || "all",
      breeds
    });
  } catch (error) {
    console.error("❌ Error fetching breeds:", error);
    res.status(500).json({ message: "Failed to fetch breeds", error: error.message });
  }
};


// ✅ Update a breed
exports.updateBreed = async (req, res) => {
  try {
    const { id } = req.params;
    const farmerId = req.user._id || req.user.id;

    const breed = await Breed.findOneAndUpdate(
      { _id: id, farmer_id: farmerId },
      req.body,
      { new: true }
    );

    if (!breed) {
      return res.status(404).json({ message: "Breed not found" });
    }

    res.json({ message: "Breed updated successfully", breed });
  } catch (error) {
    res.status(500).json({ message: "Error updating breed", error: error.message });
  }
};

// ✅ Soft delete (deactivate) a breed
exports.deleteBreed = async (req, res) => {
  try {
    const { id } = req.params;
    const farmerId = req.user._id || req.user.id;

    const breed = await Breed.findOneAndUpdate(
      { _id: id, farmer_id: farmerId },
      { is_active: false },
      { new: true }
    );

    if (!breed) {
      return res.status(404).json({ message: "Breed not found" });
    }

    res.json({ message: "Breed deactivated successfully", breed });
  } catch (error) {
    res.status(500).json({ message: "Error deleting breed", error: error.message });
  }
};
