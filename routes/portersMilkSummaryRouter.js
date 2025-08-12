// milkRoutes.js
const express = require('express');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

module.exports = (io) => {
    const router = express.Router();
    const milkController = require('../controllers/porterMilkSummaryController')(io);

    router.get('/', milkController.getPortersMilkSummary);
    router.get('/records', verifyToken, authorizeRoles('farmer'), milkController.farmerMilkSummary);
    router.get('/monthly', verifyToken, milkController.getAdminPortersMonthlySummary);
    router.get('/adminSummary', verifyToken, milkController.getFarmerMonthlySummary);
    router.get('/farmerSummary', verifyToken, milkController.downloadMonthlyMilkReport);

    return router;
};
