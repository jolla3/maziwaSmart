const mongoose = require("mongoose");
const { Cow, Breed } = require("../models/model");
const cloudinary = require("cloudinary").v2; // ✅ Import cloudinary


/**
 * Helper: Format sire data
 */
const formatSire = (animal) => {
  // Handle unpopulated case (ObjectId only)
  if (animal.father_id && typeof animal.father_id !== "object") {
    return {
      type: "internal",
      id: animal.father_id
    };
  }

  return animal.father_id
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
    : null;
};

/**
 * CREATE ANIMAL
 */
exports.createAnimal = async (req, res) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

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
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "species, cow_name, gender, and stage are required"
      });
    }

    const validSpecies = ["cow", "goat", "sheep", "pig"];
    if (!validSpecies.includes(species)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: `Invalid species '${species}'`
      });
    }

    // Enforce father_id XOR bull_*
    if (father_id && (bull_code || bull_name)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Cannot provide both father_id and bull_code/bull_name" });
    }
    if (!father_id && ((bull_code && !bull_name) || (!bull_code && bull_name))) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "bull_code and bull_name must both be provided if either is" });
    }

    // Validate refs outside transaction (perf)
    if (mother_id && !(await Cow.exists({ _id: mother_id }))) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid mother_id" });
    }
    if (father_id && !(await Cow.exists({ _id: father_id }))) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid father_id" });
    }
    if (breed_id && !(await Breed.exists({ _id: breed_id }))) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid breed_id" });
    }

    // Biology checks outside
    if (mother_id) {
      const mother = await Cow.findById(mother_id).select('gender species');
      if (mother.gender !== 'female') {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Mother must be female" });
      }
      if (mother.species !== species) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Mother species mismatch" });
      }
    }
    if (father_id) {
      const father = await Cow.findById(father_id).select('gender species');
      if (father.gender !== 'male') {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Father must be male" });
      }
      if (father.species !== species) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Father species mismatch" });
      }
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
      farmer_id,
      farmer_code,
      photos,
      mother_id: mother_id || null,
      father_id: father_id || null,
      bull_code: father_id ? null : bull_code || null,
      bull_name: father_id ? null : bull_name || null
    });

    await animal.save({ session });

    // Handle offspring linking
    const ops = [];
    if (mother_id) {
      ops.push(
        Cow.findByIdAndUpdate(mother_id, {
          $addToSet: { offspring_ids: animal._id },
          $inc: { total_offspring: 1 }
        }, { session })
      );
    }
    if (father_id) {
      ops.push(
        Cow.findByIdAndUpdate(father_id, {
          $addToSet: { offspring_ids: animal._id },
          $inc: { total_offspring: 1 }
        }, { session })
      );
    }
    await Promise.all(ops);

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      animal: {
        id: animal._id,
        cow_name: animal.cow_name,
        species: animal.species,
        gender: animal.gender,
        stage: animal.stage,
        status: animal.status,
        photos: animal.photos || [],
        birth_date: animal.birth_date,
        age: animal.age,
        breed: animal.breed_id?.name || animal.breed || null,
        sire: formatSire(animal),
        offspring: animal.offspring_ids?.map(o => ({
          id: o._id,
          name: o.cow_name,
          species: o.species,
          birth_date: o.birth_date
        })) || [],
        created_at: animal.createdAt
      }
    });
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
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
    const { species, gender, stage, sortBy = "createdAt", order = "-1" } = req.query;

    const filter = { farmer_code };
    if (species) filter.species = species;
    if (gender) filter.gender = gender;
    if (stage) filter.stage = Array.isArray(stage) ? { $in: stage } : stage;

    const sort = {};
    sort[sortBy] = order === "1" ? 1 : -1;

    const animals = await Cow.find(filter)
      .populate("mother_id", "cow_name species")
      .populate("father_id", "cow_name species")
      .populate("breed_id", "name")
      .populate("offspring_ids", "cow_name species birth_date")
      .sort(sort)
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
      age: a.age,
      breed: a.breed_id?.name || a.breed || null,
      sire: formatSire(a),
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
      .populate("offspring_ids", "cow_name species birth_date")
      .lean();

    if (!animal) {
      return res.status(404).json({ message: "Animal not found" });
    }

    res.json({
      success: true,
      animal: {
        id: animal._id,
        cow_name: animal.cow_name,
        species: animal.species,
        gender: animal.gender,
        stage: animal.stage,
        status: animal.status,
        photos: animal.photos || [],
        birth_date: animal.birth_date,
        age: animal.age,
        breed: animal.breed_id?.name || animal.breed || null,
        sire: formatSire(animal),
        offspring: animal.offspring_ids?.map(o => ({
          id: o._id,
          name: o.cow_name,
          species: o.species,
          birth_date: o.birth_date
        })) || [],
        created_at: animal.createdAt
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
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const farmer_code = req.user.code;
    const { id } = req.params;

    let updates = { ...req.body };

    // Reject invalid species in updates
    if (updates.species && !["cow", "goat", "sheep", "pig"].includes(updates.species)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: `Invalid species '${updates.species}'` });
    }

    // Defensive: Prevent unsetting required fields
    if (!updates.species && updates.species !== '') delete updates.species;
    if (!updates.cow_name && updates.cow_name !== '') delete updates.cow_name;
    if (!updates.gender && updates.gender !== '') delete updates.gender;

    // Enforce father_id XOR bull_*
    if (updates.father_id && (updates.bull_code || updates.bull_name)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Cannot provide both father_id and bull_code/bull_name" });
    }
    if (!updates.father_id && ((updates.bull_code && !updates.bull_name) || (!updates.bull_code && updates.bull_name))) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "bull_code and bull_name must both be provided if either is" });
    }

    // Validate refs outside transaction
    if (updates.mother_id && !(await Cow.exists({ _id: updates.mother_id }))) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid mother_id" });
    }
    if (updates.father_id && !(await Cow.exists({ _id: updates.father_id }))) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid father_id" });
    }
    if (updates.breed_id && !(await Breed.exists({ _id: updates.breed_id }))) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Invalid breed_id" });
    }

    // Fetch existing inside transaction
    const existing = await Cow.findOne({ _id: id, farmer_code }).session(session);
    if (!existing) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Animal not found or not yours"
      });
    }

    // Biology checks inside
    if (updates.mother_id) {
      const mother = await Cow.findById(updates.mother_id).select('gender species _id').session(session);
      if (mother.gender !== 'female') {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Mother must be female" });
      }
      if (mother.species !== (updates.species || existing.species)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Mother species mismatch" });
      }
      if (updates.mother_id.toString() === id) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Cannot be own parent" });
      }
    }
    if (updates.father_id) {
      const father = await Cow.findById(updates.father_id).select('gender species _id').session(session);
      if (father.gender !== 'male') {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Father must be male" });
      }
      if (father.species !== (updates.species || existing.species)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Father species mismatch" });
      }
      if (updates.father_id.toString() === id) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: "Cannot be own parent" });
      }
    }

    const uploadedPhotos = req.files?.map(file => file.path || file.filename || file.secure_url) || [];

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
          console.error(`❌ Failed to delete Cloudinary image: ${url}`, err);
        }
      }
    }

    // Handle offspring unlink if changing parents (loop for less verbose)
    const parents = [
      { field: 'mother_id', old: existing.mother_id, new: updates.mother_id },
      { field: 'father_id', old: existing.father_id, new: updates.father_id }
    ];

    const ops = [];
    for (const parent of parents) {
      if (parent.new && parent.new.toString() !== parent.old?.toString()) {
        if (parent.old) {
          ops.push(
            Cow.findByIdAndUpdate(parent.old, {
              $pull: { offspring_ids: existing._id },
              $inc: { total_offspring: -1 }
            }, { session })
          );
        }
        ops.push(
          Cow.findByIdAndUpdate(parent.new, {
            $addToSet: { offspring_ids: existing._id },
            $inc: { total_offspring: 1 }
          }, { session })
        );
      }
    }
    await Promise.all(ops);

    const updatedAnimal = await Cow.findOneAndUpdate(
      { _id: id, farmer_code },
      updates,
      { new: true, runValidators: true, session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: uploadedPhotos.length
        ? "✅ Animal updated successfully (new photos added)"
        : "✅ Animal updated successfully",
      animal: {
        id: updatedAnimal._id,
        cow_name: updatedAnimal.cow_name,
        species: updatedAnimal.species,
        gender: updatedAnimal.gender,
        stage: updatedAnimal.stage,
        status: updatedAnimal.status,
        photos: updatedAnimal.photos || [],
        birth_date: updatedAnimal.birth_date,
        age: updatedAnimal.age,
        breed: updatedAnimal.breed_id?.name || updatedAnimal.breed || null,
        sire: formatSire(updatedAnimal),
        offspring: updatedAnimal.offspring_ids?.map(o => ({
          id: o._id,
          name: o.cow_name,
          species: o.species,
          birth_date: o.birth_date
        })) || [],
        created_at: updatedAnimal.createdAt
      }
    });
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    console.error("❌ Error updating animal:", error);
    if (error.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({
      success: false,
      message: "Failed to update animal",
      error: error.message
    });
  }
};



// DELETE /api/farmer/animals/:id
exports.deleteAnimal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const farmer_code = req.user.code;
    const { id } = req.params;

    // 🔍 Find animal within session
    const animal = await Cow.findOne({ _id: id, farmer_code }).session(session);
    if (!animal) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Animal not found or not yours",
      });
    }

    // 1️⃣ Delete Cloudinary images (best-effort)
    if (Array.isArray(animal.photos)) {
      for (const url of animal.photos) {
        try {
          const publicId = url.split("/").pop().split(".")[0];
          await cloudinary.uploader.destroy(`maziwasmart/animals/${publicId}`);
        } catch (err) {
          console.warn(`⚠️ Failed to delete Cloudinary image: ${url}`, err);
        }
      }
    }

    const ops = [];

    // 2️⃣ Unlink from parents
    if (animal.mother_id) {
      ops.push(
        Cow.findByIdAndUpdate(
          animal.mother_id,
          { $pull: { offspring_ids: animal._id }, $inc: { total_offspring: -1 } },
          { session }
        )
      );
    }
    if (animal.father_id) {
      ops.push(
        Cow.findByIdAndUpdate(
          animal.father_id,
          { $pull: { offspring_ids: animal._id }, $inc: { total_offspring: -1 } },
          { session }
        )
      );
    }

    // 3️⃣ Remove this animal from any other offspring arrays (defensive)
    ops.push(
      Cow.updateMany(
        { offspring_ids: animal._id },
        { $pull: { offspring_ids: animal._id } },
        { session }
      )
    );

    await Promise.all(ops);

    // 4️⃣ Delete the animal
    await Cow.deleteOne({ _id: animal._id }).session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Animal deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Error deleting animal:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete animal",
      error: error.message,
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
