// /utils/offspringUtil.js
// ================================
// Utility for auto-calving and offspring creation
// ================================

const moment = require("moment");
const { Cow, Notification } = require("../models/model"); // Adjust path if needed

// Reuse these from your cron file (or import if separated)
const getAgeString = (birth_date) => {
  if (!birth_date) return "";

  const birth = moment(birth_date);
  const now = moment();

  const years = now.diff(birth, "years");
  birth.add(years, "years");

  const months = now.diff(birth, "months");
  birth.add(months, "months");

  const days = now.diff(birth, "days");

  return `${years} years, ${months} months, ${days} days`;
};

const getTargetStage = (species, gender, birth_date) => {
  if (!birth_date) return null;

  const ageInMonths = moment().diff(birth_date, "months");

  switch (species) {
    case "cow":
      if (gender === "female") {
        if (ageInMonths < 12) return "calf";
        if (ageInMonths < 24) return "heifer";
        return "cow";
      }

      if (gender === "male") {
        if (ageInMonths < 12) return "bull_calf";
        if (ageInMonths < 36) return "young_bull";
        return "mature_bull";
      }

      return null;

    case "goat":
      if (ageInMonths < 6) return "kid";
      if (gender === "female") return ageInMonths < 12 ? "doeling" : "nanny";
      if (gender === "male") return ageInMonths < 12 ? "buckling" : "buck";
      return null;

    case "sheep":
      if (ageInMonths < 6) return "lamb";
      if (gender === "female") return "ewe";
      if (gender === "male") return "ram";
      return null;

    case "pig":
      if (ageInMonths < 6) return "piglet";
      if (gender === "female") return ageInMonths < 12 ? "gilt" : "sow";
      if (gender === "male") return "boar";
      return null;

    default:
      return null;
  }
};

const createOffspring = async (mother, birthDate) => {
  const birthMoment = moment(birthDate);

  // Random gender assignment (50/50) - replace with insemination logic if available
  const genders = ["male", "female"];
  const gender = genders[Math.floor(Math.random() * 2)];

  const stage = getTargetStage(mother.species, gender, birthMoment.toDate());
  if (!stage) {
    throw new Error(`Invalid stage computation for species: ${mother.species}, gender: ${gender}`);
  }

  const offspring = new Cow({
    farmer_id: mother.farmer_id, // Required: inherit from mother
    species: mother.species,     // Required: inherit from mother
    farmer_code: mother.farmer_code, // Assuming this exists and is needed for notifications
    cow_name: `Offspring of ${mother.cow_name || "Unnamed"} (${birthMoment.format("YYYY-MM-DD")})`, // Sensible default
    birth_date: birthMoment.toDate(),
    gender,
    stage,
    age: getAgeString(birthMoment.toDate()),
    is_calf: mother.species === "cow" && stage === "calf", // Align with your cron logic
    status: "active", // Default
    pregnancy: { is_pregnant: false }, // Init empty
    // Add more fields as needed (e.g., mother_id: mother._id for lineage)
  });

  await offspring.save();

  // Reset mother pregnancy
  mother.pregnancy.is_pregnant = false;
  mother.pregnancy.expected_due_date = null;
  mother.pregnancy.insemination_id = null;
  mother.status = "active";
  await mother.save();

  // Birth notification
  await Notification.create({
    farmer_code: mother.farmer_code,
    cow: mother._id, // Links to mother
    type: "calving",
    message: `Auto-calving complete: ${mother.species} ${mother.cow_name || "animal"} gave birth to new offspring (ID: ${offspring._id}, Gender: ${gender}).`
  });

  return offspring; // For logging or further use if needed
};

// Wrap for error isolation in cron
const safeCreateOffspring = async (mother, birthDate) => {
  try {
    await createOffspring(mother, birthDate);
  } catch (err) {
    console.error(`Failed to create offspring for animal ${mother._id}:`, err);
    // Optionally notify admin or log to DB - don't throw to avoid killing the whole cron
  }
};

module.exports = { createOffspring: safeCreateOffspring }; // Export wrapped version