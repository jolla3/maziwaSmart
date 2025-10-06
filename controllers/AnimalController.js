// controllers/animalController.js
const {Cow} = require("../models/model");

exports.createAnimal = async (req, res) => {
  try {
    const { species } = req.body;
    const farmer_id = req.user.id;
    const farmer_code = req.user.code;

    if (!species) {
      return res.status(400).json({ message: "Species is required" });
    }
    const photos = req.files?.map(file => `/uploads/animals/${file.filename}`) || [];


    let newAnimal;

    // 🐄 Cow block
    if (species === "cow") {
      const { cow_name, breed_id, gender, birth_date,  mother_id } = req.body;
      newAnimal = new Cow({
        species,
        cow_name,
        breed_id,
        gender,
        birth_date,
        farmer_id,
        farmer_code,
        mother_id,
        photos,
        is_calf: false
      });
    }

    // 🐐 Goat block
    else if (species === "goat") {
      const { goat_name, breed_id, gender, birth_date } = req.body;
      newAnimal = new Cow({
        species,
        cow_name: goat_name, // reuse field
        breed_id,
        gender,
        birth_date,
        farmer_id,
        farmer_code,
        photos
      });
    }

    // 🐑 Sheep block
    else if (species === "sheep") {
      const { sheep_name, breed_id, gender, birth_date } = req.body;
      newAnimal = new Cow({
        species,
        cow_name: sheep_name,
        breed_id,
        gender,
        birth_date,
        farmer_id,
        farmer_code,
        photos

      });
    }

    // 🐖 Pig block
    else if (species === "pig") {
      const { pig_name, breed_id, gender, birth_date } = req.body;
      newAnimal = new Cow({
        species,
        cow_name: pig_name,
        breed_id,
        gender,
        birth_date,
        farmer_id,
        farmer_code,
        photos
      });
    }

    // 🐂 Bull block
    else if (species === "bull") {
      const { bull_name, breed_id, birth_date } = req.body;
      newAnimal = new Cow({
        species,
        cow_name: bull_name,
        breed_id,
        gender: "male", // fixed
        birth_date,
        farmer_id,
        farmer_code,
        photos
      });
    }

    else {
      return res.status(400).json({ message: "Invalid species type" });
    }

    await newAnimal.save();

    res.status(201).json({
      message: `✅ ${species} registered successfully`,
      animal: newAnimal
    })
  } catch (error) {
    console.error("❌ Animal creation error:", error);
    res.status(500).json({ message: "Failed to register animal", error: error.message });
  }
};

// GET /api/farmer/animals
exports.getMyAnimals = async (req, res) => {
  try {
    const farmer_code = req.user.code;
    const { species, gender, stage, page = 1, limit = 20, sortBy = "created_at", order = "desc" } = req.query;

    // ✅ Build dynamic filter
    const filter = { farmer_code };
    if (species) filter.species = species;
    if (gender) filter.gender = gender;
    if (stage) filter.stage = Array.isArray(stage) ? { $in: stage } : stage;

    // ✅ Sorting
    const sort = {};
    sort[sortBy] = order === "asc" ? 1 : -1;

    // ✅ Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // 🔎 Query animals
    const animals = await Cow.find(filter)
      .populate("breed_id", "breed_name")
      .populate("mother_id", "cow_name species")
      .populate({ path: "offspring_ids", select: "cow_name species birth_date" })
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // ✅ Total count for pagination
    const total = await Cow.countDocuments(filter);

    // ✅ Stats breakdown per species + stage
    const stats = await Cow.aggregate([
      { $match: filter },
      { $group: { _id: { species: "$species", stage: "$stage" }, count: { $sum: 1 } } },
      {
        $group: {
          _id: "$_id.species",
          breakdown: { $push: { stage: "$_id.stage", count: "$count" } },
          total: { $sum: "$count" }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
        stats // e.g. [{ _id: "cow", breakdown: [...], total: 12 }]
      },
      animals: animals.map(a => ({
        id: a._id,
        name: a.cow_name,
        species: a.species,
        gender: a.gender,
        stage: a.stage || null,
        birth_date: a.birth_date,
        breed: a.breed_id?.breed_name || null,
        mother: a.mother_id ? { id: a.mother_id._id, name: a.mother_id.cow_name } : null,
        offspring: a.offspring_ids?.map(o => ({
          id: o._id,
          name: o.cow_name,
          species: o.species,
          birth_date: o.birth_date
        })),
        created_at: a.created_at
      }))
    });
  } catch (error) {
    console.error("❌ Error fetching animals:", error);
    res.status(500).json({ success: false, message: "Failed to fetch animals", error: error.message });
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

    // 🧠 1️⃣ Prepare update object
    const updates = { ...req.body };

    // 🧠 2️⃣ Map uploaded photos (from multer)
    const uploadedPhotos = req.files?.map(file => `/uploads/animals/${file.filename}`) || [];

    // 🧠 3️⃣ Get current animal to merge photos safely
    const existing = await Cow.findOne({ _id: id, farmer_code });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Animal not found or not yours"
      });
    }

    const existingPhotos = existing.photos || [];
    const bodyPhotos = Array.isArray(req.body.photos)
      ? req.body.photos.filter(p => p && p.trim() !== "")
      : [];

    // 🧠 4️⃣ Combine and deduplicate
    const mergedPhotos = [...new Set([...existingPhotos, ...bodyPhotos, ...uploadedPhotos])];
    updates.photos = mergedPhotos;

    // 🧠 5️⃣ Run update
    const updatedAnimal = await Cow.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    });

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

    const deletedAnimal = await Cow.findOneAndDelete({ _id: id, farmer_code });

    if (!deletedAnimal) {
      return res.status(404).json({ success: false, message: "Animal not found or not yours" });
    }

    res.status(200).json({
      success: true,
      message: "🗑️ Animal deleted successfully",
      animal: deletedAnimal
    });
  } catch (error) {
    console.error("❌ Error deleting animal:", error);
    res.status(500).json({ success: false, message: "Failed to delete animal", error: error.message });
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
