// /cron/updateCowStages.js

const cron = require('node-cron');
// const mongoose = require('mongoose');
const { Cow } = require('../models/model');
const moment = require('moment');

const promoteCowStages = async () => {
  try {
    const today = moment();

    // Promote CALF ➜ HEIFER (after 1 year)
    const calvesToPromote = await Cow.find({
      stage: 'calf',
      from_birth: true,
      birth_date: { $lte: moment().subtract(1, 'years').toDate() }
    });

    for (const calf of calvesToPromote) {
      calf.stage = 'heifer';
      calf.is_calf = false;
      await calf.save();
    }

    // Promote HEIFER ➜ COW (after 2 years)
    const heifersToPromote = await Cow.find({
      stage: 'heifer',
      from_birth: true,
      birth_date: { $lte: moment().subtract(2, 'years').toDate() }
    });

    for (const heifer of heifersToPromote) {
      heifer.stage = 'cow';
      await heifer.save();
    }

    console.log(`✅ Cow stage promotion complete: ${calvesToPromote.length} calves ➜ heifer, ${heifersToPromote.length} heifers ➜ cow`);
  } catch (err) {
    console.error('❌ Error in cow stage promotion cron:', err.message);
  }
};

// Schedule the job to run daily at midnight
cron.schedule('0 0 * * *', () => {
  console.log('⏰ Running scheduled cow stage promotion...');
  promoteCowStages();
});

