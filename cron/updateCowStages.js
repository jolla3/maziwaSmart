// /cron/updateAnimalStages.js
// ================================
// Daily stage corrections + age updates + pregnancy reminders + auto-calving
// ================================

const cron = require("node-cron");
const moment = require("moment");
const { Cow, Notification, Insemination } = require("../models/model");
const { createOffspring } = require("../utils/offspringUtil"); // 🔥 offspring utility

const gestationDaysMap = {
  cow: 283,
  goat: 150,
  sheep: 152,
  pig: 115
};

// Helper: Compute age string (e.g., "2 years, 3 months, 5 days")
const getAgeString = (birth_date) => {
  try {
    const now = moment();
    const years = now.diff(birth_date, "years");
    now.subtract(years, "years");
    const months = now.diff(birth_date, "months");
    now.subtract(months, "months");
    const days = now.diff(birth_date, "days");
    return `${years} years, ${months} months, ${days} days`;
  } catch (err) {
    console.error("Error computing age string:", err.message);
    return "";
  }
};

// Helper: Compute target stage based on species, gender, birth_date
const getTargetStage = (species, gender, birth_date) => {
  try {
    const now = moment();
    const ageInMonths = now.diff(birth_date, "months");

    switch (species) {
      case "cow":
        if (gender === "female") {
          if (ageInMonths < 12) return "calf";
          if (ageInMonths < 24) return "heifer";
          return "cow";
        } else if (gender === "male") {
          if (ageInMonths < 12) return "calf";
          if (ageInMonths < 36) return "bull_calf";
          if (ageInMonths < 48) return "young_bull";
          return "mature_bull";
        }
        return null; // Unknown gender

      case "goat":
        if (ageInMonths < 6) return "kid";
        if (gender === "female") {
          return ageInMonths < 12 ? "doeling" : "nanny";
        } else if (gender === "male") {
          return ageInMonths < 12 ? "buckling" : "buck";
        }
        return null;

      case "sheep":
        if (ageInMonths < 6) return "lamb";
        if (gender === "female") return "ewe";
        if (gender === "male") return "ram";
        return null;

      case "pig":
        if (ageInMonths < 6) return "piglet";
        if (gender === "female") {
          return ageInMonths < 12 ? "gilt" : "sow";
        } else if (gender === "male") {
          return "boar";
        }
        return null;

      default:
        return null;
    }
  } catch (err) {
    console.error("Error computing target stage:", err.message);
    return null;
  }
};

const updateStagesAndPregnancies = async () => {
  try {
    const today = moment();

    /** ================================
     * 🐮 Stage corrections + age updates (all species)
     * ================================ */
    const animalsWithBirthDate = await Cow.find({
      birth_date: { $exists: true, $ne: null }
    });

    let stageChanges = {
      cow: 0, bull: 0, goat: 0, sheep: 0, pig: 0
    };

    for (const animal of animalsWithBirthDate) {
      try {
        const ageStr = getAgeString(animal.birth_date);
        const targetStage = getTargetStage(animal.species, animal.gender, animal.birth_date);

        let changed = false;
        if (animal.age !== ageStr) {
          animal.age = ageStr;
          changed = true;
        }
        if (targetStage && animal.stage !== targetStage) {
          animal.stage = targetStage;
          changed = true;
          stageChanges[animal.species]++;
        }
        // Handle legacy is_calf for cows
        if (animal.species === "cow") {
          animal.is_calf = animal.stage === "calf";
        }

        if (changed) {
          await animal.save();
        }
      } catch (err) {
        console.error(`Error updating animal ${animal._id}:`, err.message);
      }
    }

    /** ================================
     * 👶 Pregnancies (all species)
     * ================================ */
    const pregnantAnimals = await Cow.find({
      "pregnancy.is_pregnant": true,
      "pregnancy.expected_due_date": { $exists: true }
    });

    
    for (const animal of pregnantAnimals) {
      try {
        const dueDate = moment(animal.pregnancy.expected_due_date);
        const daysLeft = dueDate.diff(today, "days");

        // Progressive reminders
        if ([90, 30, 7, 1].includes(daysLeft)) {
          await Notification.create({
            farmer_code: animal.farmer_code,
            cow: animal._id,
            type: "gestation_reminder",
            message: `⏳ Reminder: Your ${animal.species} ${animal.cow_name || "animal"} is due in ${daysLeft} day(s).`
          });
        }

        // Auto-calving (birth) 🔥 now uses utility
        if (today.isSameOrAfter(dueDate, "day")) {
          await createOffspring(animal, today);
        }

        // Overdue reset (20% buffer)
        if (animal.pregnancy.insemination_id) {
          const insemination = await Insemination.findById(animal.pregnancy.insemination_id);
          if (insemination) {
            const daysSince = today.diff(moment(insemination.insemination_date), "days");
            const gestationDays = gestationDaysMap[animal.species] || 283;
            const overdueLimit = Math.round(gestationDays * 1.2);

            if (daysSince > overdueLimit) {
              animal.pregnancy.is_pregnant = false;
              animal.pregnancy.expected_due_date = null;
              animal.pregnancy.insemination_id = null;
              animal.status = "active";
              await animal.save();
            }
          }
        }
      } catch (err) {
        console.error(`Error processing pregnancy for animal ${animal._id}:`, err.message);
      }
    }

    console.log(`✅ Cron complete:
      Stage changes: cows/bulls=${stageChanges.cow}, goats=${stageChanges.goat}, sheep=${stageChanges.sheep}, pigs=${stageChanges.pig},
      Ages updated for ${animalsWithBirthDate.length} animals,
      ${pregnantAnimals.length} pregnancies checked.`);
  } catch (err) {
    console.error("❌ Error in stage/pregnancy cron:", err.message);
  }
}

// Run every day at midnight (00:00)
cron.schedule("0 0 * * *", updateStagesAndPregnancies);