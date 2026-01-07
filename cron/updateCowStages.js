// /cron/updateAnimalStages.js
// ================================
// Daily stage promotions + pregnancy reminders + auto-calving
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

const updateStagesAndPregnancies = async () => {
  try {
    const today = moment();

    /** ================================
     * 🐮 Stage promotions
     * ================================ */

    // 🔹 Cow / Bull
    const calves = await Cow.find({
      stage: "calf",
      birth_date: { $lte: moment().subtract(1, "years").toDate() }
    });
    for (const calf of calves) {
      try {
        if (calf.gender === "female") calf.stage = "heifer";
        else if (calf.gender === "male") calf.stage = "bull_calf";
        calf.is_calf = false;
        await calf.save();
      } catch (err) {
        console.error(`Error updating calf ${calf._id}:`, err.message);
      }
    }

    const heifers = await Cow.find({
      stage: "heifer",
      birth_date: { $lte: moment().subtract(2, "years").toDate() }
    });
    for (const h of heifers) {
      try {
        h.stage = "cow";
        await h.save();
      } catch (err) {
        console.error(`Error updating heifer ${h._id}:`, err.message);
      }
    }

    const youngBulls = await Cow.find({
      stage: "bull_calf",
      birth_date: { $lte: moment().subtract(3, "years").toDate() }
    });
    for (const b of youngBulls) {
      try {
        b.stage = "young_bull";
        await b.save();
      } catch (err) {
        console.error(`Error updating young bull ${b._id}:`, err.message);
      }
    }

    const matureBulls = await Cow.find({
      stage: "young_bull",
      birth_date: { $lte: moment().subtract(4, "years").toDate() }
    });
    for (const mb of matureBulls) {
      try {
        mb.stage = "mature_bull";
        await mb.save();
      } catch (err) {
        console.error(`Error updating mature bull ${mb._id}:`, err.message);
      }
    }

    // 🔹 Goats
    const kids = await Cow.find({
      species: "goat",
      stage: "kid",
      birth_date: { $lte: moment().subtract(6, "months").toDate() }
    });
    for (const g of kids) {
      try {
        g.stage = g.gender === "female" ? "doeling" : "buckling";
        await g.save();
      } catch (err) {
        console.error(`Error updating kid ${g._id}:`, err.message);
      }
    }

    const doelings = await Cow.find({
      species: "goat",
      stage: "doeling",
      birth_date: { $lte: moment().subtract(1, "years").toDate() }
    });
    for (const d of doelings) {
      try {
        d.stage = "nanny";
        await d.save();
      } catch (err) {
        console.error(`Error updating doeling ${d._id}:`, err.message);
      }
    }

    const bucklings = await Cow.find({
      species: "goat",
      stage: "buckling",
      birth_date: { $lte: moment().subtract(1, "years").toDate() }
    });
    for (const b of bucklings) {
      try {
        b.stage = "buck";
        await b.save();
      } catch (err) {
        console.error(`Error updating buckling ${b._id}:`, err.message);
      }
    }

    // 🔹 Sheep
    const lambs = await Cow.find({
      species: "sheep",
      stage: "lamb",
      birth_date: { $lte: moment().subtract(6, "months").toDate() }
    });
    for (const s of lambs) {
      try {
        s.stage = s.gender === "female" ? "ewe" : "ram";
        await s.save();
      } catch (err) {
        console.error(`Error updating lamb ${s._id}:`, err.message);
      }
    }

    // 🔹 Pigs
    const piglets = await Cow.find({
      species: "pig",
      stage: "piglet",
      birth_date: { $lte: moment().subtract(6, "months").toDate() }
    });
    for (const p of piglets) {
      try {
        p.stage = p.gender === "female" ? "gilt" : "boar";
        await p.save();
      } catch (err) {
        console.error(`Error updating piglet ${p._id}:`, err.message);
      }
    }

    const gilts = await Cow.find({
      species: "pig",
      stage: "gilt",
      birth_date: { $lte: moment().subtract(1, "years").toDate() }
    });
    for (const g of gilts) {
      try {
        g.stage = "sow";
        await g.save();
      } catch (err) {
        console.error(`Error updating gilt ${g._id}:`, err.message);
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
      ${calves.length} calves ➜ heifer/bull_calf,
      ${heifers.length} heifers ➜ cow,
      ${youngBulls.length} bull_calves ➜ young_bull,
      ${matureBulls.length} young_bulls ➜ mature_bull,
      ${kids.length} kids ➜ doeling/buckling,
      ${doelings.length} doelings ➜ nanny,
      ${bucklings.length} bucklings ➜ buck,
      ${lambs.length} lambs ➜ ewe/ram,
      ${piglets.length} piglets ➜ gilt/boar,
      ${gilts.length} gilts ➜ sow,
      ${pregnantAnimals.length} pregnancies checked.`);
  } catch (err) {
    console.error("❌ Error in stage/pregnancy cron:", err.message);
  }
}

// Run every day at midnight (00:00)
cron.schedule("0 0 * * *", updateStagesAndPregnancies)