const { Cow } = require('../models/model'); // Adjust the path as needed
const moment = require('moment');

exports.addCalf = async (req, res) => {
  try {
    const { cow_name, gender, breed_id, birth_date, mother_id } = req.body;
    const farmer_id = req.user.userId;
    const farmer_code = req.user.code;

    const calf = new Cow({
      cow_name,
      gender,
      breed_id,
      birth_date,
      mother_id: mother_id || null,
      stage: 'calf',
      is_calf: true,
      from_birth: true, // ✅ Only calves added via this route are updated by cron
      farmer_id,
      farmer_code
    });

    await calf.save();

    // 🐄 Add to mother's offspring_ids if mother exists
    if (mother_id) {
      await Cow.findByIdAndUpdate(mother_id, {
        $push: { offspring_ids: calf._id }
      });
    }

    res.status(201).json({
      message: "🐄 Calf registered successfully",
      calf
    });

  } catch (err) {
    console.error("❌ Error registering calf:", err);
    res.status(500).json({
      message: "❌ Failed to register calf",
      error: err.message
    });
  }
};



exports.getCowFamilyTree = async (req, res) => {
  try {
    const { id } = req.params;

    const cow = await Cow.findById(id)
      .populate('offspring_ids', 'cow_name birth_date stage')
      .populate('breed_id', 'breed_name');

    if (!cow) {
      return res.status(404).json({ message: "Cow not found" });
    }

    // Calculate mother's age
    const cowAgeInMonths = moment().diff(moment(cow.birth_date), 'months');
    const motherAgeYears = Math.floor(cowAgeInMonths / 12);
    const motherAgeMonths = cowAgeInMonths % 12;

    // Format offspring details
    const offspring = cow.offspring_ids.map(child => {
      const months = moment().diff(moment(child.birth_date), 'months');
      const years = Math.floor(months / 12);
      const remainingMonths = months % 12;

      return {
        name: child.cow_name,
        age: `${years} years ${remainingMonths} months`,
        stage: child.stage
      };
    });

    res.status(200).json({
      mother: {
        name: cow.cow_name,
        age: `${motherAgeYears} years ${motherAgeMonths} months`,
        breed: cow.breed_id?.breed_name || 'N/A',
      },
      offspring: offspring.length ? offspring : "No calves recorded"
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to load family tree", error: err.message });
  }
};
