const moment = require('moment');
const { Cow, Breed, Insemination } = require('../models/model');

/**
 * ➕ Register calf from insemination
 */
exports.addCalf = async (req, res) => {
  try {
    const {
      breed_id,
      species,
      animal_name,
      gender,
      birth_date,
      animal_code,
      breed_name,
      mother_id,
      bull_code,
      bull_name
    } = req.body;

    const farmer_id = req.user.id;
    const farmer_code = req.user.code;

    let mother = null;
    if (mother_id) {
      mother = await Cow.findById(mother_id);
      if (!mother) {
        return res.status(404).json({
          success: false,
          message: "Mother animal not found"
        });
      }
    }

    // 🧬 Determine breedDoc
    let breedDoc = null;
    if (breed_id) {
      breedDoc = await Breed.findOne({ _id: breed_id, farmer_id });

      if (!breedDoc) {
        return res.status(400).json({
          success: false,
          message: "Invalid breed_id — no matching breed found for this farmer"
        });
      }

      // Auto-patch missing bull data
      let updated = false;
      if (!breedDoc.bull_code && bull_code) {
        breedDoc.bull_code = bull_code;
        updated = true;
      }
      if (!breedDoc.bull_name && bull_name) {
        breedDoc.bull_name = bull_name;
        updated = true;
      }
      if (updated) await breedDoc.save();

    } else {
      if (!species || !breed_name) {
        return res.status(400).json({
          success: false,
          message: "species and breed_name are required when breed_id is not provided"
        });
      }

      breedDoc = await new Breed({
        breed_name,
        species,
        bull_code,
        bull_name,
        farmer_id
      }).save();
    }

    // 🧠 Determine species source
    const actualSpecies = species || breedDoc.species || (mother ? mother.species : "cow");

    // 🍼 Intelligent stage determination
    const stageMap = {
      cow: { female: "heifer", male: "bull", default: "calf" },
      bull: { female: "heifer", male: "bull", default: "calf" },
      goat: { female: "doe", male: "buck", default: "kid" },
      sheep: { female: "ewe", male: "ram", default: "lamb" },
      pig: { female: "sow", male: "boar", default: "piglet" }
    };

    let stage;
    if (mother) {
      // If from mother, use newborn stage
      const newbornMap = { cow: "calf", bull: "calf", goat: "kid", sheep: "lamb", pig: "piglet" };
      stage = newbornMap[mother.species] || "calf";
    } else {
      // No mother: use gendered adult stage
      const map = stageMap[actualSpecies] || {};
      stage = gender ? map[gender] || map.default : map.default || "unknown";
    }

    // 🧾 Create animal/offspring record
    const offspring = await new Cow({
      cow_name: animal_name,
      cow_code: animal_code || null,
      species: actualSpecies,
      gender,
      breed_id: breedDoc._id,
      breed_name: breedDoc.breed_name,
      bull_code: breedDoc.bull_code || bull_code || null,
      bull_name: breedDoc.bull_name || bull_name || null,
      birth_date: birth_date || new Date(),
      mother_id: mother?._id || null,
      stage,
      is_calf: stage === "calf",
      from_birth: !!mother,
      farmer_id,
      farmer_code,
      status: "active"
    }).save();

    // 👩‍👧 Update mother's offspring count (if mother exists)
    if (mother) {
      await Cow.findByIdAndUpdate(mother._id, {
        $addToSet: { offspring_ids: offspring._id },
        $inc: { total_offspring: 1 }
      });
    }

    return res.status(201).json({
      success: true,
      message: `${offspring.species} registered successfully.`,
      data: offspring
    });

  } catch (err) {
    console.error("🐄 addCalf error:", err);
    return res.status(500).json({
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
