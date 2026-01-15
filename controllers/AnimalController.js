// controllers/animalController.js
const {Cow} = require("../models/model");

exports.createAnimal = async (req, res) => {
  try {
    const farmer_id = req.user.id;
    const farmer_code = req.user.code;
    const { species, name, breed, gender, birth_date, stage, mother_id, bull_code, bull_name, origin_farm, country } = req.body; // Use name, add species-specific

    if (!species || !name || !stage) {
      return res.status(400).json({ message: "Species, name, and stage are required" });
    }

    // Validate stage per species (mirror frontend, but backend enforce)
    const validStages = {
      cow: ['calf', 'heifer', 'cow'],
      bull: ['bull_calf', 'young_bull', 'mature_bull'],
      goat: ['kid', 'doeling', 'buckling', 'nanny', 'buck'],
      sheep: ['lamb', 'ewe', 'ram'],
      pig: ['piglet', 'gilt', 'sow', 'boar'],
    };
    if (!validStages[species]?.includes(stage)) {
      return res.status(400).json({ message: `Invalid stage '${stage}' for species '${species}'` });
    }

    const photos = req.files?.map(file => file.path || file.filename || file.secure_url) || []; // Handle Cloudinary or local

    const newAnimalData = {
      species,
      cow_name, // Renamed from cow_name
      breed, // String, assuming schema fix
      gender: species === 'bull' ? 'male' : gender, // Force for bull
      birth_date,
      stage,
      farmer_id,
      farmer_code,
      photos,
      is_calf: species === 'cow' && stage === 'calf' ? true : false, // Derive if needed
    };

    // Species-specific fields
    if (species === 'cow') {
      newAnimalData.mother_id = mother_id;
      // Add bull_code/name if sent for cows too? Assume not.
    } else if (species === 'bull') {
      newAnimalData.origin_farm = origin_farm;
      newAnimalData.country = country;
      newAnimalData.bull_code = bull_code; // If applicable
      newAnimalData.bull_name = bull_name;
    } else {
      // For goat/sheep/pig, add bull_code/name if breeding info needed (e.g., sire)
      newAnimalData.bull_code = bull_code;
      newAnimalData.bull_name = bull_name;
    }

    const newAnimal = new Cow(newAnimalData); // Rename model to Animal eventually
    await newAnimal.save();

    res.status(201).json({
      success: true,
      message: `✅ ${species.charAt(0).toUpperCase() + species.slice(1)} added successfully`,
      animal: newAnimal
    });
  } catch (error) {
    console.error("❌ Animal creation error:", error);
    res.status(500).json({ success: false, message: "Failed to add animal", error: error.message });
  }
};
// GET /api/farmer/animals
exports.getMyAnimals = async (req, res) => { 
  try {
    const farmer_code = req.user.code;
    const {
      species,
      gender,
      stage,
      page = 1,
      limit = 20,
      sortBy = "created_at",
      order = "desc"
    } = req.query;

    // 🧠 Defensive casting
    const safePage = Math.max(parseInt(page) || 1, 1);
    const safeLimit = Math.min(parseInt(limit) || 20, 100);
    const skip = (safePage - 1) * safeLimit;

    // ✅ Dynamic filters
    const filter = { farmer_code };
    if (species) filter.species = species;
    if (gender) filter.gender = gender;
    if (stage) filter.stage = Array.isArray(stage) ? { $in: stage } : stage;

    // ✅ Sorting logic
    const sort = {};
    sort[sortBy] = order === "asc" ? 1 : -1;

    // 🔎 Query animals (with extended select for bull fields)
    const animals = await Cow.find(filter)
      .select(
        "cow_name species gender stage status photos birth_date breed_id mother_id father_id bull_code bull_name offspring_ids pregnancy lifetime_milk daily_average created_at"
      )
      .populate("breed_id", "breed_name")
      .populate("mother_id", "cow_name species")
      .populate("father_id", "cow_name species")
      .populate({
        path: "offspring_ids",
        select: "cow_name species birth_date"
      })
      .sort(sort)
      .skip(skip)
      .limit(safeLimit)
      .lean();

    // ✅ Total count
    const total = await Cow.countDocuments(filter);

    // ✅ Stats breakdown per species + stage
    const rawStats = await Cow.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { species: "$species", stage: "$stage" },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.species",
          breakdown: {
            $push: { stage: "$_id.stage", count: "$count" }
          },
          total: { $sum: "$count" }
        }
      }
    ]);

    // 🧩 Flatten stats for charts
    const stats = rawStats.map(s => ({
      species: s._id,
      total: s.total,
      breakdown: s.breakdown.reduce((acc, b) => {
        acc[b.stage || "unknown"] = b.count;
        return acc;
      }, {})
    }));

    // ✅ Build clean animal data
    const formattedAnimals = animals.map(a => ({
      id: a._id,
      name: a.cow_name,
      species: a.species,
      gender: a.gender,
      stage: a.stage || null,
      status: a.status || "active",
      photos: a.photos || [],
      birth_date: a.birth_date,
      breed: a.breed_id?.breed_name || null,
      mother: a.mother_id
        ? { id: a.mother_id._id, name: a.mother_id.cow_name, species: a.mother_id.species }
        : null,
      father: a.father_id
        ? { id: a.father_id._id, name: a.father_id.cow_name, species: a.father_id.species }
        : a.bull_name
        ? { code: a.bull_code || null, name: a.bull_name }
        : null,
      offspring: a.offspring_ids?.map(o => ({
        id: o._id,
        name: o.cow_name,
        species: o.species,
        birth_date: o.birth_date
      })),
      pregnancy: a.pregnancy
        ? {
            is_pregnant: a.pregnancy.is_pregnant || false,
            expected_due_date: a.pregnancy.expected_due_date || null
          }
        : { is_pregnant: false, expected_due_date: null },
      lifetime_milk: a.lifetime_milk || 0,
      daily_average: a.daily_average || 0,
      created_at: a.created_at
    }));

    // ✅ Send structured response
    res.status(200).json({
      success: true,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
        hasNextPage: safePage * safeLimit < total,
        hasPrevPage: safePage > 1,
        stats
      },
      animals: formattedAnimals
    });
  } catch (error) {
    console.error("❌ Error fetching animals:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch animals",
      error: error.message
    });
  }
};


// GET /api/farmer/animals/:id
exports.getAnimalById = async (req, res) => {
  try {
    const farmer_code = req.user.code;
    const { id } = req.params;

    const animal = await Cow.findOne({ _id: id, farmer_code })
      .populate("breed_id", "breed_name")
      .populate("mother_id", "cow_name species")
      .populate({ path: "offspring_ids", select: "cow_name species birth_date" });

    if (!animal) {
      return res.status(404).json({ success: false, message: "Animal not found" });
    }

    res.status(200).json({ success: true, animal });
  } catch (error) {
    console.error("❌ Error fetching animal:", error);
    res.status(500).json({ success: false, message: "Failed to fetch animal", error: error.message });
  }
};



// PUT /api/farmer/animals/:id
exports.updateAnimal = async (req, res) => {
  try {
    const farmer_code = req.user.code;
    const { id } = req.params;

    // 🧠 1️⃣ Prepare update fields
    const updates = { ...req.body };

    // 🧠 2️⃣ Extract Cloudinary URLs from multer
    const uploadedPhotos =
      req.files?.map(file => file.path || file.filename || file.secure_url) || [];

    // 🧠 3️⃣ Get existing animal
    const existing = await Cow.findOne({ _id: id, farmer_code });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Animal not found or not yours"
      });
    }

    const existingPhotos = existing.photos || [];
    const bodyPhotos = Array.isArray(req.body.photos)
      ? req.body.photos.filter(p => typeof p === "string" && p.trim() !== "")
      : [];

    // 🧠 4️⃣ Determine photos to keep and remove
    const mergedPhotos = [...new Set([...bodyPhotos, ...uploadedPhotos])];
    const removedPhotos = existingPhotos.filter(p => !mergedPhotos.includes(p));

    updates.photos = mergedPhotos;

    // 🧠 5️⃣ Delete removed photos from Cloudinary
    if (removedPhotos.length > 0) {
      for (const url of removedPhotos) {
        try {
          const publicId = url.split("/").pop().split(".")[0];
          await cloudinary.uploader.destroy(`maziwasmart/animals/${publicId}`);
        } catch (err) {
          console.warn(`⚠️ Failed to delete Cloudinary image: ${url}`);
        }
      }
    }

    // 🧠 6️⃣ Secure update (respect farmer_code)
    const updatedAnimal = await Cow.findOneAndUpdate(
      { _id: id, farmer_code },
      updates,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: uploadedPhotos.length
        ? "✅ Animal updated successfully (new photos added)"
        : "✅ Animal updated successfully",
      animal: updatedAnimal
    });
  } catch (error) {
    console.error("❌ Error updating animal:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update animal",
      error: error.message
    });
  }
};


// DELETE /api/farmer/animals/:id
exports.deleteAnimal = async (req, res) => {
  try {
    const farmer_code = req.user.code;
    const { id } = req.params;

    // 🔍 Find animal by ID and owner
    const animal = await Cow.findOne({ _id: id, farmer_code });
    if (!animal) {
      return res.status(404).json({
        success: false,
        message: "Animal not found or not yours"
      });
    }

    // 🧹 1️⃣ Delete Cloudinary images
    if (Array.isArray(animal.photos) && animal.photos.length > 0) {
      for (const url of animal.photos) {
        try {
          const publicId = url.split("/").pop().split(".")[0];
          await cloudinary.uploader.destroy(`maziwasmart/animals/${publicId}`);
        } catch (err) {
          console.warn(`⚠️ Failed to delete Cloudinary image: ${url}`);
        }
      }
    }

    // 🧬 2️⃣ Clean up relationships (if needed)
    // Remove this animal from offspring lists of others
    await Cow.updateMany(
      { offspring_ids: id },
      { $pull: { offspring_ids: id } }
    );

    // 🗑️ 3️⃣ Delete the animal record
    await Cow.deleteOne({ _id: id, farmer_code });

    res.status(200).json({
      success: true,
      message: "🗑️ Animal deleted successfully (and photos cleaned up)"
    });
  } catch (error) {
    console.error("❌ Error deleting animal:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete animal",
      error: error.message
    });
  }
};

// PUT /api/farmer/animals/bulk
// body: { ids: ["id1", "id2"], update: { gender: "female", stage: "heifer" } }
exports.bulkUpdateAnimals = async (req, res) => {
  try {
    const farmer_code = req.user.code;
    const { ids, update } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "No animal IDs provided" });
    }
    if (!update || typeof update !== "object") {
      return res.status(400).json({ success: false, message: "No update object provided" });
    }

    const result = await Cow.updateMany(
      { _id: { $in: ids }, farmer_code },
      { $set: update }
    );

    res.status(200).json({
      success: true,
      message: `✅ Updated ${result.modifiedCount} animals successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error("❌ Bulk update error:", error);
    res.status(500).json({ success: false, message: "Failed to update animals", error: error.message });
  }
};
