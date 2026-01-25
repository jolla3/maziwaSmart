const {Cow} = require("../models/model");  // Assumes models/Cow.js exports the Cow model correctly

exports.createAnimal = async (req, res) => {
  try {
    const farmer_id = req.user.id;
    const farmer_code = req.user.code;
    const { species, cow_name, breed, gender, birth_date, stage, mother_id, father_id, bull_code, bull_name } = req.body;

    // Basic required field check (let schema handle detailed validation)
    if (!species || !cow_name || !gender) {
      return res.status(400).json({ message: "Species, name, and gender are required" });
    }

    // Reject invalid species (e.g., legacy "bull")
    const validSpecies = ["cow", "goat", "sheep", "pig"];
    if (!validSpecies.includes(species)) {
      return res.status(400).json({ message: `Invalid species '${species}'. Must be one of: ${validSpecies.join(', ')}` });
    }

    const photos = req.files?.map(file => file.path || file.filename || file.secure_url) || [];

    const newAnimalData = {
      species,
      cow_name,
      breed,
      gender,
      birth_date,
      stage,
      farmer_id,
      farmer_code,
      photos,
      mother_id,  // Applies to any species
      father_id,  // Applies to any species
      bull_code,
      bull_name
    };

    const newAnimal = new Cow(newAnimalData);
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
      sortBy = "createdAt",  // Fixed: Matches schema timestamps
      order = "desc"
    } = req.query;

    const filter = { farmer_code };
    if (species) filter.species = species;
    if (gender) filter.gender = gender;
    if (stage) filter.stage = Array.isArray(stage) ? { $in: stage } : stage;

    const sort = {};
    sort[sortBy] = order === "asc" ? 1 : -1;

    const animals = await Cow.find(filter)
      .select(
        "cow_name species gender stage status photos birth_date breed breed_id mother_id father_id bull_code bull_name offspring_ids pregnancy lifetime_milk daily_average createdAt age"
      )
      .populate("mother_id", "cow_name species")
      .populate("father_id", "cow_name species")
      .populate("breed_id", "name")
      .populate({
        path: "offspring_ids",
        select: "cow_name species birth_date"
      })
      .sort(sort)
      .lean();

    const total = await Cow.countDocuments(filter);

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

    const stats = rawStats.map(s => ({
      species: s._id,
      total: s.total,
      breakdown: s.breakdown.reduce((acc, b) => {
        acc[b.stage || "unknown"] = b.count;
        return acc;
      }, {})
    }));

    const formattedAnimals = animals.map(a => {
      const animal = new Cow(a);  // Rehydrate for virtuals
      return {
        id: a._id,
        cow_name: a.cow_name,
        species: a.species,
        gender: a.gender,
        stage: a.stage || null,
        status: a.status || "active",
        photos: a.photos || [],
        birth_date: a.birth_date,
        age: animal.computedAge || a.age,  // Use computed age, fallback to stored
        breed: a.breed_id ? a.breed_id.name : a.breed || null,
        mother: a.mother_id
          ? { id: a.mother_id._id, name: a.mother_id.cow_name, species: a.mother_id.species }
          : null,
        sire: a.father_id
          ? { type: 'internal', id: a.father_id._id, name: a.father_id.cow_name, species: a.father_id.species }
          : a.bull_name
          ? { type: 'external', code: a.bull_code || null, name: a.bull_name }
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
        created_at: a.createdAt
      };
    });

    res.status(200).json({
      success: true,
      meta: {
        total,
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
      .populate("mother_id", "cow_name species")
      .populate("father_id", "cow_name species")
      .populate("breed_id", "name")
      .populate({ path: "offspring_ids", select: "cow_name species birth_date" });

    if (!animal) {
      return res.status(404).json({ success: false, message: "Animal not found" });
    }

    res.status(200).json({ 
      success: true, 
      animal: {
        ...animal.toObject(),
        age: animal.computedAge || animal.age,  // Ensure age is included
        sire: animal.father_id
          ? { type: 'internal', id: animal.father_id._id, name: animal.father_id.cow_name, species: animal.father_id.species }
          : animal.bull_name
          ? { type: 'external', code: animal.bull_code || null, name: animal.bull_name }
          : null
      }
    });
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

    let updates = { ...req.body };

    // Reject invalid species in updates
    if (updates.species && !["cow", "goat", "sheep", "pig"].includes(updates.species)) {
      return res.status(400).json({ message: `Invalid species '${updates.species}'` });
    }

    // Defensive: Prevent unsetting required fields
    if (!updates.species && updates.species !== '') delete updates.species;
    if (!updates.cow_name && updates.cow_name !== '') delete updates.cow_name;
    if (!updates.gender && updates.gender !== '') delete updates.gender;

    const uploadedPhotos = req.files?.map(file => file.path || file.filename || file.secure_url) || [];

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

    const mergedPhotos = [...new Set([...bodyPhotos, ...uploadedPhotos])];
    const removedPhotos = existingPhotos.filter(p => !mergedPhotos.includes(p));

    updates.photos = mergedPhotos;

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
