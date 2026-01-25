// /cron/updateAnimalStages.js
// ================================
// Daily stage corrections + age updates + pregnancy reminders + auto-calving
// ================================

const cron = require("node-cron");
const moment = require("moment");
const { Cow, Notification, Insemination } = require("../models/model");
const { createOffspring } = require("../utils/offspringUtil");

const gestationDaysMap = {
  cow: 283,
  goat: 150,
  sheep: 152,
  pig: 115
};

/**
 * Compute age string safely (no moment mutation bugs)
 */
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

/**
 * Compute target stage based on species, gender, and age
 */
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

const updateStagesAndPregnancies = async () => {
  try {
    const today = moment();

    /** ================================
     * Stage + age updates
     * ================================ */
    const animals = await Cow.find({
      birth_date: { $exists: true, $ne: null }
    });

    const stageChanges = {
      cow: 0,
      goat: 0,
      sheep: 0,
      pig: 0
    };

    for (const animal of animals) {
      let changed = false;

      const newAge = getAgeString(animal.birth_date);
      if (animal.age !== newAge) {
        animal.age = newAge;
        changed = true;
      }

      const newStage = getTargetStage(
        animal.species,
        animal.gender,
        animal.birth_date
      );

      if (newStage && animal.stage !== newStage) {
        animal.stage = newStage;
        changed = true;
        stageChanges[animal.species]++;
      }

      if (animal.species === "cow") {
        animal.is_calf = animal.stage === "calf";
      }

      if (changed) {
        await animal.save();
      }
    }

    /** ================================
     * Pregnancy handling
     * ================================ */
    const pregnantAnimals = await Cow.find({
      "pregnancy.is_pregnant": true,
      "pregnancy.expected_due_date": { $exists: true }
    });

    for (const animal of pregnantAnimals) {
      const dueDate = moment(animal.pregnancy.expected_due_date);
      const daysLeft = dueDate.diff(today, "days");

      // reminders
      if ([90, 30, 7, 1].includes(daysLeft)) {
        await Notification.create({
          farmer_code: animal.farmer_code,
          cow: animal._id,
          type: "gestation_reminder",
          message: `Reminder: Your ${animal.species} ${animal.cow_name || "animal"} is due in ${daysLeft} day(s).`
        });
      }

      // auto-calving
      if (today.isSameOrAfter(dueDate, "day")) {
        await createOffspring(animal, today);
      }

      // overdue reset (20% buffer)
      if (animal.pregnancy.insemination_id) {
        const insemination = await Insemination.findById(
          animal.pregnancy.insemination_id
        );

        if (insemination) {
          const daysSince = today.diff(
            moment(insemination.insemination_date),
            "days"
          );

          const gestationDays =
            gestationDaysMap[animal.species] || 283;

          if (daysSince > Math.round(gestationDays * 1.2)) {
            animal.pregnancy.is_pregnant = false;
            animal.pregnancy.expected_due_date = null;
            animal.pregnancy.insemination_id = null;
            animal.status = "active";
            await animal.save();
          }
        }
      }
    }

    console.log(
      `Cron complete:
       Stage changes: ${JSON.stringify(stageChanges)}
       Animals processed: ${animals.length}
       Pregnancies checked: ${pregnantAnimals.length}`
    );
  } catch (err) {
    console.error("Cron failure:", err);
  }
};

// Run daily at midnight
cron.schedule("0 0 * * *", updateStagesAndPregnancies);
