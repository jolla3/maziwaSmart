
// Create a new breed
// controllers/breedController.js

// ✅ Create a new breed
const { Breed } = require('../models/model');

// ✅ Create a new breed
exports.createBreed = async (req, res) => {
  try {
    const {
      breed_name,
      animal_species,
      bull_code,
      bull_name,
      origin_farm,
      country,
      description
    } = req.body;

    const farmerId = req.user._id || req.user.id;

    // Validate animal_species
    const validSpecies = ['cow', 'goat', 'sheep', 'pig'];
    if (!validSpecies.includes(animal_species)) {
      return res.status(400).json({
        success: false,
        message: `Invalid animal_species. Must be one of: ${validSpecies.join(', ')}`
      });
    }

    // Validate breed_name is provided
    if (!breed_name || !breed_name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'breed_name is required'
      });
    }

    // GUARD: Check for duplicate breed
    const maleRoleMap = {
      'cow': 'bull',
      'goat': 'buck',
      'sheep': 'ram',
      'pig': 'boar'
    };

    const existing = await Breed.findOne({
      farmer_id: farmerId,
      breed_name: breed_name.trim(),
      animal_species: animal_species,
      is_active: true
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Breed "${breed_name}" already exists for ${animal_species}. Cannot create duplicate.`
      });
    }

    // Create breed
    const breed = new Breed({
      breed_name: breed_name.trim(),
      animal_species,
      male_role: maleRoleMap[animal_species],
      bull_code: bull_code?.trim() || null,
      bull_name: bull_name?.trim() || null,
      origin_farm: origin_farm?.trim() || null,
      country: country?.trim() || null,
      description: description?.trim() || null,
      farmer_id: farmerId
    });

    // Schema validation runs here and will reject biologically invalid combinations
    await breed.save();

    res.status(201).json({
      success: true,
      message: 'Breed created successfully',
      breed: {
        _id: breed._id,
        breed_name: breed.breed_name,
        animal_species: breed.animal_species,
        male_role: breed.male_role,
        bull_code: breed.bull_code,
        bull_name: breed.bull_name
      }
    });

  } catch (error) {
    console.error('❌ addBreed error:', error);
    
    // Schema validation error
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create breed'
    });
  }
};

// ✅ Get all breeds for logged farmer
exports.getBreeds = async (req, res) => {
  try {
    const farmerId = req.user._id || req.user.id;
    const { animal_species } = req.query;

    let query = {
      farmer_id: farmerId,
      is_active: true
    };

    // Validate and apply species filter
    if (animal_species) {
      const validSpecies = ['cow', 'goat', 'sheep', 'pig'];
      
      if (!validSpecies.includes(animal_species)) {
        return res.status(400).json({
          success: false,
          message: `Invalid animal_species. Must be one of: ${validSpecies.join(', ')}`
        });
      }
      
      query.animal_species = animal_species;
    }

    const breeds = await Breed.find(query)
      .select('_id breed_name bull_code bull_name animal_species male_role')
      .sort({ breed_name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      count: breeds.length,
      animal_species: animal_species || 'all',
      breeds
    });

  } catch (error) {
    console.error('❌ getBreeds error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch breeds'
    });
  }
};



// ✅ Update a breed
exports.updateBreed = async (req, res) => {
  try {
    const { id } = req.params;
    const farmerId = req.user._id || req.user.id;

    const { breed_name, description, species, bull_code, bull_name, origin_farm, country } = req.body;

    const updateData = {
      breed_name,
      description,
      species,
    };

    if (species === "bull") {
      updateData.bull_code = bull_code;
      updateData.bull_name = bull_name;
      updateData.origin_farm = origin_farm;
      updateData.country = country;
    } else {
      // clear bull fields if switching away from bull
      updateData.bull_code = "";
      updateData.bull_name = "";
      updateData.origin_farm = "";
      updateData.country = "";
    }

    const breed = await Breed.findOneAndUpdate(
      { _id: id, farmer_id: farmerId },
      updateData,
      { new: true }
    );

    if (!breed) {
      return res.status(404).json({ message: "Breed not found" });
    }

    res.json({ message: "Breed updated successfully", breed });
  } catch (error) {
    console.error("❌ Error updating breed:", error);
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
    console.error("❌ Error deleting breed:", error);
    res.status(500).json({ message: "Error deleting breed", error: error.message });
  }
};
