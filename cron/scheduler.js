const cron = require('node-cron');
const promoteCowStages = require('./promoteCowStages'); // adjust path if different

// Run promotion every day at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('⏰ Running cow stage promotion job...');
  await promoteCowStages();
});

// Run daily at midnight
cron.schedule('0 0 * * *', () => {
  console.log('⏰ Running scheduled cow stage + pregnancy check...');
  promoteCowStagesAndPregnancyCheck();
});
