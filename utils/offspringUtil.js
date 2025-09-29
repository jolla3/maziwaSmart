// /utils/offspringUtil.js
// ================================
// Utility for creating offspring (calves, kids, lambs, piglets, etc.)
// ================================

const { Cow, Breed, Insemination, Notification } = require("../models/model");

// Map species -> default newborn stage
const newbornStageMap = {
  cow: "calf",
  goat: "kid",
  sheep: "lamb",
  pig: "piglet",
};

/**
 * Create offspring from an insemination record (manual controller use).
 */
const addCalfFromPregnancy = async (req, res) => {
  try {
    const { insemination_id, cow_name, gender, birth_date, cow_code } = req.body;
    const farmer_id = req.user.id;
    const farmer_code = Number(req.user.code);

    // 1️⃣ Insemination record
    const insemination = await Insemination.findOne({ _id: insemination_id, farmer_code });
    if (!insemination) {
      return res.status(404).json({ success: false, message: "Insemination record not found" });
    }

    // 2️⃣ Mother cow
    const mother = await Cow.findById(insemination.cow_id);
    if (!mother) {
      return res.status(404).json({ success: false, message: "Mother animal not found" });
    }

    // 3️⃣ Ensure breed exists
    let breedDoc = null;
    if (insemination.bull_breed) {
      breedDoc = await Breed.findOne({ farmer_id, breed_name: insemination.bull_breed });
      if (!breedDoc) {
        breedDoc = await new Breed({ breed_name: insemination.bull_breed, farmer_id }).save();
      }
    }

    // 4️⃣ Register offspring
    const calf = await new Cow({
      cow_name,
      cow_code: cow_code || null,
      gender,
      breed_id: breedDoc?._id || null,
      bull_code: insemination.bull_code || null,
      bull_name: insemination.bull_name || null,
      birth_date,
      mother_id: mother._id,
      stage: newbornStageMap[mother.species] || "calf",
      is_calf: true,
      from_birth: true,
      farmer_id,
      farmer_code,
      species: mother.species,
      status: "active",
    }).save();

    // 5️⃣ Update mother
    await Cow.findByIdAndUpdate(mother._id, {
      $push: { offspring_ids: calf._id },
      $inc: { total_offspring: 1 },
      $set: {
        "pregnancy.is_pregnant": false,
        "pregnancy.insemination_id": null,
        "pregnancy.expected_due_date": null,
        status: "active",
      },
    });

    // 6️⃣ Mark insemination as calved
    insemination.has_calved = true;
    insemination.calf_id = calf._id;
    await insemination.save();

    // 7️⃣ Notify farmer
    await Notification.create({
      farmer_code,
      cow: mother._id,
      type: "calving_alert",
      message: `🎉 Your ${mother.species} ${mother.cow_name || "animal"} has given birth!`,
    });

    res.status(201).json({ success: true, message: "Offspring registered successfully", data: calf });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to register offspring", error: err.message });
  }
};

/**
 * Create offspring programmatically (cron or system use).
 */
const createOffspring = async (mother, birthDate = new Date()) => {
  // Auto-generate identifiers if missing
  const autoName = `${mother.species}_offspring_${Date.now()}`;
  const autoCode = `OFF-${mother.species.toUpperCase()}-${Date.now()}`;

  const calf = await new Cow({
    cow_name: autoName,
    cow_code: autoCode,
    species: mother.species,
    stage: newbornStageMap[mother.species] || "calf",
    is_calf: true,
    from_birth: true,
    birth_date: birthDate,
    farmer_code: mother.farmer_code,
    farmer_id: mother.farmer_id,
    mother_id: mother._id,
    bull_code: mother.bull_code || null,
    bull_name: mother.bull_name || null,
    status: "active",
  }).save();

  // Update mother
  mother.pregnancy.is_pregnant = false;
  mother.pregnancy.expected_due_date = null;
  const inseminationId = mother.pregnancy.insemination_id; // capture before reset
  mother.pregnancy.insemination_id = null;
  mother.status = "active";
  await mother.save();

  // Update mother offspring
  await Cow.findByIdAndUpdate(mother._id, {
    $push: { offspring_ids: calf._id },
    $inc: { total_offspring: 1 },
  });

  // Mark insemination as calved if exists
  if (inseminationId) {
    const insemination = await Insemination.findById(inseminationId);
    if (insemination) {
      insemination.has_calved = true;
      insemination.calf_id = calf._id;
      await insemination.save();
    }
  }

  // Notify farmer
  await Notification.create({
    farmer_code: mother.farmer_code,
    cow: mother._id,
    type: "calving_alert",
    message: `🎉 Your ${mother.species} ${mother.cow_name || "animal"} has given birth!`,
  });

  return calf;
};

module.exports = {
  addCalfFromPregnancy,
  createOffspring,
};
