// /cron/updateCowStages.js
// ================================
// Daily stage promotions + pregnancy reminders
// ================================

const cron = require('node-cron');
const moment = require('moment');
const { Cow, Notification, Insemination } = require('../models/model');

const updateStagesAndPregnancies = async () => {
  try {
    const today = moment();

    /** 🐮 1. Promote Calves → Heifers/Bulls (after 1 year) */
    const calvesToPromote = await Cow.find({
      stage: 'calf',
      from_birth: true,
      birth_date: { $lte: moment().subtract(1, 'years').toDate() }
    });

    for (const calf of calvesToPromote) {
      if (calf.gender === 'female') {
        calf.stage = 'heifer';
      } else if (calf.gender === 'male') {
        calf.stage = 'bull';
      }
      calf.is_calf = false;
      await calf.save();
    }

    /** 🐄 2. Promote Heifers → Cows (after 2 years) */
    const heifersToPromote = await Cow.find({
      stage: 'heifer',
      from_birth: true,
      birth_date: { $lte: moment().subtract(2, 'years').toDate() }
    });

    for (const heifer of heifersToPromote) {
      heifer.stage = 'cow';
      await heifer.save();
    }

    /** 🐂 3. Promote Bulls → Mature Bulls (after 3 years, optional) */
    const youngBullsToPromote = await Cow.find({
      stage: 'bull',
      from_birth: true,
      birth_date: { $lte: moment().subtract(3, 'years').toDate() }
    });

    for (const bull of youngBullsToPromote) {
      bull.stage = 'mature_bull';
      await bull.save();
    }

    /** 👶 4. Pregnancy reminders + overdue handling */
    const pregnantAnimals = await Cow.find({
      'pregnancy.is_pregnant': true,
      'pregnancy.expected_due_date': { $exists: true }
    });

    for (const animal of pregnantAnimals) {
      const dueDate = moment(animal.pregnancy.expected_due_date);
      const daysLeft = dueDate.diff(today, 'days');

      // Progressive reminders
      if ([90, 30, 7, 1].includes(daysLeft)) {
        await Notification.create({
          farmer_code: animal.farmer_code,
          animal: animal._id,
          type: 'gestation_reminder',
          message: `⏳ Reminder: Your ${animal.species} ${animal.cow_name || 'animal'} is due in ${daysLeft} day(s).`
        });
      }

      // Auto-reset pregnancy if far overdue (20% buffer beyond gestation)
      if (animal.pregnancy.insemination_id) {
        const insemination = await Insemination.findById(animal.pregnancy.insemination_id);
        if (insemination) {
          const daysSinceInsemination = today.diff(moment(insemination.insemination_date), 'days');

          const gestationDaysMap = { cow: 283, goat: 150, sheep: 152 };
          const gestationDays = gestationDaysMap[animal.species] || 283;
          const overdueLimit = Math.round(gestationDays * 1.2); // 20% buffer

          if (daysSinceInsemination > overdueLimit) {
            animal.pregnancy.is_pregnant = false;
            animal.pregnancy.expected_due_date = null;
            animal.pregnancy.insemination_id = null;
            animal.status = 'active';
            await animal.save();
          }
        }
      }
    }

    console.log(`✅ Cron complete:
      ${calvesToPromote.length} calves ➜ heifer/bull,
      ${heifersToPromote.length} heifers ➜ cow,
      ${youngBullsToPromote.length} bulls ➜ mature_bull,
      ${pregnantAnimals.length} pregnancies checked.`);
  } catch (err) {
    console.error('❌ Error in cow stage/pregnancy cron:', err.message);
  }
};

// Run every morning at 7AM
cron.schedule('0 7 * * *', updateStagesAndPregnancies);
