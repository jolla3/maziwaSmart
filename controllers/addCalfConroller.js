const moment = require('moment');
const { Cow, Breed, Insemination } = require('../models/model');

/**
 * ➕ Register calf from insemination
 */
exports.addCalf = async (req, res) => {
  try {
    const { insemination_id, animal_name, gender, birth_date, animal_code } = req.body;
    const farmer_id = req.user.id;
    const farmer_code = Number(req.user.code);

    // 1️⃣ Verify insemination record
    const insemination = await Insemination.findOne({ _id: insemination_id, farmer_code });
    if (!insemination) {
      return res.status(404).json({ success: false, message: "Insemination record not found" });
    }

    // 2️⃣ Verify mother animal
    const mother = await Cow.findOne({ _id: insemination.cow_id, farmer_code });
    if (!mother) {
      return res.status(404).json({ success: false, message: "Mother animal not found" });
    }

    // 3️⃣ Ensure bull breed exists in farmer's breeds
    let breedDoc = null;
    if (insemination.bull_breed) {
      breedDoc = await Breed.findOne({ farmer_id, breed_name: insemination.bull_breed });
      if (!breedDoc) {
        breedDoc = await new Breed({ breed_name: insemination.bull_breed, farmer_id }).save();
      }
    }

    // 4️⃣ Determine newborn stage based on species
    const stageMap = {
      cow: "calf",
      bull: "calf",      // bull calves
      goat: "kid",
      sheep: "lamb",
      pig: "piglet"
    };
    const newbornStage = stageMap[mother.species] || "calf";

    // 5️⃣ Register offspring
    const offspring = await new Cow({
      cow_name: animal_name,
      cow_code: animal_code || null,
      species: mother.species,             // inherit species
      gender,
      breed_id: breedDoc?._id || null,
      bull_code: insemination.bull_code || null,
      bull_name: insemination.bull_name || null,
      birth_date,
      mother_id: mother._id,
      insemination_id: insemination._id,
      stage: newbornStage,
      is_calf: newbornStage === "calf",    // only true for cattle
      from_birth: true,
      farmer_id,
      farmer_code,
      status: "active"
    }).save();

    // 6️⃣ Update mother’s offspring list + count
    await Cow.findByIdAndUpdate(mother._id, {
      $push: { offspring_ids: offspring._id },
      $inc: { total_offspring: 1 }
    });

    // 7️⃣ Mark insemination as calved
    insemination.has_calved = true;
    insemination.calf_id = offspring._id;
    await insemination.save();

    res.status(201).json({
      success: true,
      message: `${mother.species} offspring registered successfully`,
      data: offspring
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to register offspring",
      error: err.message
    });
  }
};

/**
 * 🌳 Cow Family Tree
 */
exports.getCowFamilyTree = async (req, res) => {
  try {
    const { id } = req.params;

    const cow = await Cow.findById(id)
      .populate('offspring_ids', 'cow_name birth_date stage gender')
      .populate('breed_id', 'breed_name')
      .populate('mother_id', 'cow_name birth_date gender');

    if (!cow) {
      return res.status(404).json({ success: false, message: "Cow not found" });
    }

    // Current cow age
    const ageMonths = moment().diff(moment(cow.birth_date), 'months');
    const cowAge = `${Math.floor(ageMonths / 12)} years ${ageMonths % 12} months`;

    // Offspring
    const offspring = cow.offspring_ids.map(child => {
      const m = moment().diff(moment(child.birth_date), 'months');
      return {
        name: child.cow_name,
        age: `${Math.floor(m / 12)} years ${m % 12} months`,
        stage: child.stage,
        gender: child.gender,
      };
    });

    // Mother
    let motherDetails = null;
    if (cow.mother_id) {
      const m = moment().diff(moment(cow.mother_id.birth_date), 'months');
      motherDetails = {
        name: cow.mother_id.cow_name,
        age: `${Math.floor(m / 12)} years ${m % 12} months`,
        gender: cow.mother_id.gender,
      };
    }

    res.status(200).json({
      success: true,
      message: "Family tree loaded",
      data: {
        currentCow: {
          name: cow.cow_name,
          age: cowAge,
          breed: cow.breed_id?.breed_name || 'N/A',
          gender: cow.gender,
          stage: cow.stage,
        },
        mother: motherDetails,
        offspring: offspring.length ? offspring : []
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to load family tree", error: err.message });
  }
};

/**
 * 🐄 Get all pregnant cows
 */
exports.getAwaitingCalves = async (req, res) => {
  try {
    const farmer_id = req.user.id;
    const farmer_code = Number(req.user.code);

    // 🔎 Fetch pregnant animals of ANY species
    const pregnantAnimals = await Cow.find({
      farmer_id,
      farmer_code,
      'pregnancy.is_pregnant': true,
      status: 'pregnant'
    })
      .populate('pregnancy.insemination_id', 'insemination_date expected_due_date bull_breed bull_code bull_name')
      .populate('offspring_ids', 'cow_name species birth_date gender stage') // ✅ include children
      .lean();

    res.status(200).json({
      success: true,
      message: "Pregnant animals awaiting offspring",
      count: pregnantAnimals.length,
      data: pregnantAnimals.map(animal => ({
        id: animal._id,
        name: animal.cow_name,
        species: animal.species,
        gender: animal.gender,
        stage: animal.stage,
        status: animal.status,
        pregnancy: animal.pregnancy,
        insemination: animal.pregnancy?.insemination_id || null,
        offspring: animal.offspring_ids?.map(child => ({
          id: child._id,
          name: child.cow_name,
          species: child.species,
          birth_date: child.birth_date,
          gender: child.gender,
          stage: child.stage
        })) || []
      }))
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch awaiting offspring",
      error: err.message
    });
  }
};



/**
 * ➕ Register calf when pregnancy ends
 */
exports.addCalfFromPregnancy = async (req, res) => {
  try {
    const { insemination_id, cow_name, gender, birth_date, cow_code } = req.body;
    const farmer_id = req.user.id;
    const farmer_code = Number(req.user.code);

    // 1️⃣ Insemination
    const insemination = await Insemination.findOne({ _id: insemination_id, farmer_code });
    if (!insemination) {
      return res.status(404).json({ success: false, message: "Insemination record not found" });
    }

    // 2️⃣ Mother cow
    const mother = await Cow.findById(insemination.cow_id);
    if (!mother) {
      return res.status(404).json({ success: false, message: "Mother cow not found" });
    }

    // 3️⃣ Ensure breed exists
    let breedDoc = null;
    if (insemination.bull_breed) {
      breedDoc = await Breed.findOne({ farmer_id, breed_name: insemination.bull_breed });
      if (!breedDoc) {
        breedDoc = await new Breed({ breed_name: insemination.bull_breed, farmer_id }).save();
      }
    }

    // 4️⃣ Register calf
    const calf = await new Cow({
      cow_name,
      cow_code: cow_code || null,
      gender,
      breed_id: breedDoc?._id || null,
      bull_code: insemination.bull_code || null,
      bull_name: insemination.bull_name || null,
      birth_date,
      mother_id: mother._id,
      stage: 'calf',
      is_calf: true,
      from_birth: true,
      farmer_id,
      farmer_code,
      status: 'active'
    }).save();

    // 5️⃣ Update mother
    await Cow.findByIdAndUpdate(mother._id, {
      $push: { offspring_ids: calf._id },
      $inc: { total_offspring: 1 },
      $set: {
        'pregnancy.is_pregnant': false,
        'pregnancy.insemination_id': null,
        'pregnancy.expected_due_date': null,
        status: 'active'
      }
    });

    res.status(201).json({ success: true, message: "Calf registered successfully", data: calf });

  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to register calf", error: err.message });
  }
};
