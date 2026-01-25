const { Cow } = require("../models/model");

/**
 * CREATE ANIMAL
 */
exports.createAnimal = async (req, res) => {
  try {
    const farmer_id = req.user.id;
    const farmer_code = req.user.code;

    const {
      species,
      cow_name,
      breed,
      breed_id,
      gender,
      birth_date,
      stage,
      mother_id,
      father_id,
      bull_code,
      bull_name
    } = req.body;

    // Hard required checks
    if (!species || !cow_name || !gender || !stage) {
      return res.status(400).json({
        message: "species, cow_name, gender, and stage are required"
      });
    }

    const validSpecies = ["cow", "goat", "sheep", "pig"];
    if (!validSpecies.includes(species)) {
      return res.status(400).json({
        message: `Invalid species '${species}'`
      });
    }

    const validStages = {
      cow: ["calf", "heifer", "cow", "bull_calf", "young_bull", "mature_bull"],
      goat: ["kid", "doeling", "buckling", "nanny", "buck"],
      sheep: ["lamb", "ewe", "ram"],
      pig: ["piglet", "gilt", "sow", "boar"]
    };

    if (!validStages[species]?.includes(stage)) {
      return res.status(400).json({
        message: `Invalid stage '${stage}' for species '${species}'`
      });
    }

    // Enforce bull-stage + gender alignment
    if (
      ["bull_calf", "young_bull", "mature_bull"].includes(stage) &&
      gender !== "male"
    ) {
      return res.status(400).json({
        message: "Bull stages require gender = male"
      });
    }

    const photos =
      req.files?.map(f => f.path || f.filename || f.secure_url) || [];

    const animal = new Cow({
      species,
      cow_name,
      breed,
      breed_id,
      gender,
      birth_date,
      stage,
      farmer_id,       // 🔥 REQUIRED — this was breaking everything
      farmer_code,
      photos,
      mother_id: mother_id || null,
      father_id: father_id || null,
      bull_code: father_id ? null : bull_code || null,
      bull_name: father_id ? null : bull_name || null
    });

    await animal.save();

    res.status(201).json({
      success: true,
      animal
    });
  } catch (error) {
    console.error("❌ Create animal error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: error.message
      });
    }

    res.status(500).json({
      message: "Failed to create animal"
    });
  }
};

/**
 * GET MY ANIMALS
 */
exports.getMyAnimals = async (req, res) => {
  try {
    const farmer_code = req.user.code;
    const { species, gender, stage } = req.query;

    const filter = { farmer_code };
    if (species) filter.species = species;
    if (gender) filter.gender = gender;
    if (stage) filter.stage = Array.isArray(stage) ? { $in: stage } : stage;

    const animals = await Cow.find(filter)
      .populate("mother_id", "cow_name species")
      .populate("father_id", "cow_name species")
      .populate("breed_id", "name")
      .populate("offspring_ids", "cow_name species birth_date")
      .sort({ createdAt: -1 })
      .lean();

    const formatted = animals.map(a => ({
      id: a._id,
      cow_name: a.cow_name,
      species: a.species,
      gender: a.gender,
      stage: a.stage,
      status: a.status,
      photos: a.photos || [],
      birth_date: a.birth_date,
      age: a.age, // cron-owned
      breed: a.breed_id?.name || a.breed || null,
      sire: a.father_id
        ? {
            type: "internal",
            id: a.father_id._id,
            name: a.father_id.cow_name
          }
        : a.bull_name
        ? {
            type: "external",
            code: a.bull_code,
            name: a.bull_name
          }
        : null,
      offspring: a.offspring_ids?.map(o => ({
        id: o._id,
        name: o.cow_name,
        species: o.species,
        birth_date: o.birth_date
      })) || [],
      created_at: a.createdAt
    }));

    res.json({
      success: true,
      total: formatted.length,
      animals: formatted
    });
  } catch (error) {
    console.error("❌ Fetch animals error:", error);
    res.status(500).json({
      message: "Failed to fetch animals"
    });
  }
};

/**
 * GET SINGLE ANIMAL
 */
exports.getAnimalById = async (req, res) => {
  try {
    const farmer_code = req.user.code;
    const { id } = req.params;

    const animal = await Cow.findOne({ _id: id, farmer_code })
      .populate("mother_id", "cow_name species")
      .populate("father_id", "cow_name species")
      .populate("breed_id", "name")
      .populate("offspring_ids", "cow_name species birth_date");

    if (!animal) {
      return res.status(404).json({ message: "Animal not found" });
    }

    res.json({
      success: true,
      animal: {
        ...animal.toObject(),
        age: animal.age,
        sire: animal.father_id
          ? {
              type: "internal",
              id: animal.father_id._id,
              name: animal.father_id.cow_name
            }
          : animal.bull_name
          ? {
              type: "external",
              code: animal.bull_code,
              name: animal.bull_name
            }
          : null
      }
    });
  } catch (error) {
    console.error("❌ Get animal error:", error);
    res.status(500).json({
      message: "Failed to fetch animal"
    });
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
