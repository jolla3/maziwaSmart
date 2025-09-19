// controllers/animalController.js
const {Cow} = require("../models/model");

exports.createAnimal = async (req, res) => {
  try {
    const { species } = req.body;
    const farmer_id = req.user._id;
    const farmer_code = req.user.code;

    if (!species) {
      return res.status(400).json({ message: "Species is required" });
    }

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
        farmer_code
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
        farmer_code
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
        farmer_code
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
        farmer_code
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
