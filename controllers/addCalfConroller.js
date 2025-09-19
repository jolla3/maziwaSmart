// const { Cow } = require('../models/model'); // Adjust the path as needed
const moment = require('moment');
const { Cow, Breed, Insemination } = require('../models/model');
exports.addCalf = async (req, res) => {
  try {
    const { insemination_id, cow_name, gender, birth_date, cow_code } = req.body;
    const farmer_id = req.user.userId;
    const farmer_code = req.user.code;

    // 1️⃣ Verify insemination record
    const insemination = await Insemination.findOne({
      _id: insemination_id,
      farmer_code
    });
    if (!insemination) {
      return res.status(404).json({ message: "❌ Insemination record not found" });
    }

    // 2️⃣ Verify mother cow exists
    const mother = await Cow.findOne({
      _id: insemination.cow_id,
      farmer_code
    });
    if (!mother) {
      return res.status(404).json({ message: "❌ Mother cow not found" });
    }

    // 3️⃣ Ensure bull breed is tracked in farmer's breeds
    let breedDoc = null;
    if (insemination.bull_breed) {
      breedDoc = await Breed.findOne({
        farmer_id,
        breed_name: insemination.bull_breed
      });

      if (!breedDoc) {
        breedDoc = new Breed({
          breed_name: insemination.bull_breed,
          farmer_id
        });
        await breedDoc.save();
      }
    }

    // 4️⃣ Register the calf
    const calf = new Cow({
      cow_name,
      cow_code: cow_code || null,
      gender,
      breed_id: breedDoc ? breedDoc._id : null,
      bull_code: insemination.bull_code || null,
      bull_name: insemination.bull_name || null,
      birth_date,
      mother_id: mother._id,
      insemination_id: insemination._id, // 🔗 trace insemination
      stage: 'calf',
      is_calf: true,
      from_birth: true,
      farmer_id,
      farmer_code,
      status: 'active'
    });

    await calf.save();

    // 5️⃣ Update mother’s offspring list + count
    await Cow.findByIdAndUpdate(mother._id, {
      $push: { offspring_ids: calf._id },
      $inc: { total_offspring: 1 }
    });

    // 6️⃣ (Optional) mark insemination as "calved"
    insemination.has_calved = true;
    insemination.calf_id = calf._id;
    await insemination.save();

    // ✅ Response
    res.status(201).json({
      message: "🐄 Calf registered successfully from insemination",
      calf
    });

  } catch (err) {
    console.error("❌ Error adding calf from insemination:", err);
    res.status(500).json({
      message: "❌ Failed to register calf",
      error: err.message
    });
  }
};

exports.getCowFamilyTree = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the current cow and populate its mother and offspring
    const cow = await Cow.findById(id)
      .populate('offspring_ids', 'cow_name birth_date stage gender') 
      .populate('breed_id', 'breed_name')
      .populate('mother_id', 'cow_name birth_date gender'); // ✅ Populate the mother's details

    if (!cow) {
      return res.status(404).json({ message: "Cow not found" });
    }

    // Calculate the current cow's age
    const currentCowAgeInMonths = moment().diff(moment(cow.birth_date), 'months');
    const currentCowAgeYears = Math.floor(currentCowAgeInMonths / 12);
    const currentCowAgeMonths = currentCowAgeInMonths % 12;

    // Format offspring details
    const offspring = cow.offspring_ids.map(child => {
      const months = moment().diff(moment(child.birth_date), 'months');
      const years = Math.floor(months / 12);
      const remainingMonths = months % 12;

      return {
        name: child.cow_name,
        age: `${years} years ${remainingMonths} months`,
        stage: child.stage,
        gender: child.gender,
      };
    });

    // Get mother details and calculate her age, if she exists
    let motherDetails = null;
    if (cow.mother_id) {
      const motherAgeInMonths = moment().diff(moment(cow.mother_id.birth_date), 'months');
      const motherAgeYears = Math.floor(motherAgeInMonths / 12);
      const motherAgeMonths = motherAgeInMonths % 12;

      motherDetails = {
        name: cow.mother_id.cow_name,
        age: `${motherAgeYears} years ${motherAgeMonths} months`,
        gender: cow.mother_id.gender, // Include gender for the mother
      };
    }

    // ✅ Send the correct JSON response with separate keys for each family member
    res.status(200).json({
      currentCow: {
        name: cow.cow_name,
        age: `${currentCowAgeYears} years ${currentCowAgeMonths} months`,
        breed: cow.breed_id?.breed_name || 'N/A',
        gender: cow.gender,
        stage: cow.stage,
      },
      mother: motherDetails,
      offspring: offspring.length ? offspring : null // Use null instead of string
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load family tree", error: err.message });
  }
};


exports.getAwaitingCalves = async (req, res) => {
  try {
    const farmer_id = req.user.userId;
    const farmer_code = req.user.code;

    // Find all cows marked as pregnant
    const pregnantCows = await Cow.find({
      farmer_id,
      farmer_code,
      'pregnancy.is_pregnant': true,
      status: 'pregnant'
    })
    .populate('pregnancy.insemination_id', 'insemination_date expected_due_date bull_breed bull_code bull_name')
    .lean();

    res.status(200).json({
      message: "🐄 Pregnant cows awaiting calves",
      awaiting_calves: pregnantCows
    });
  } catch (err) {
    console.error("❌ Error fetching awaiting calves:", err);
    res.status(500).json({ message: "❌ Failed to fetch awaiting calves", error: err.message });
  }
};

exports.addCalfFromPregnancy = async (req, res) => {
  try {
    const { insemination_id, cow_name, gender, birth_date, cow_code } = req.body;
    const farmer_id = req.user.userId;
    const farmer_code = req.user.code;

    // 1️⃣ Get insemination record
    const insemination = await Insemination.findOne({ _id: insemination_id, farmer_code });
    if (!insemination) {
      return res.status(404).json({ message: "❌ Insemination record not found" });
    }

    // 2️⃣ Get mother cow
    const mother = await Cow.findById(insemination.cow_id);
    if (!mother) {
      return res.status(404).json({ message: "❌ Mother cow not found" });
    }

    // 3️⃣ Ensure breed exists
    if (insemination.bull_breed) {
      let breed = await Breed.findOne({ farmer_id, breed_name: insemination.bull_breed });
      if (!breed) {
        breed = await new Breed({ breed_name: insemination.bull_breed, farmer_id }).save();
      }
    }

    // 4️⃣ Create calf
    const calf = new Cow({
      cow_name,
      cow_code: cow_code || null,
      gender,
      breed_id: insemination.bull_breed 
        ? (await Breed.findOne({ farmer_id, breed_name: insemination.bull_breed }))._id 
        : null,
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
    });

    await calf.save();

    // 5️⃣ Update mother's offspring list
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

    res.status(201).json({
      message: "🐮 Calf registered successfully",
      calf
    });

  } catch (err) {
    console.error("❌ Error adding calf:", err);
    res.status(500).json({ message: "❌ Failed to register calf", error: err.message });
  }
};
