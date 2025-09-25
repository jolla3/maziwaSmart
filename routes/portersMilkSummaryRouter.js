const express = require('express');
const router = express.Router();
const milkController = require('../controllers/porterMilkSummaryController.js');
const { verifyToken ,authorizeRoles} = require('../middleware/authMiddleware');

router.get('/', milkController.getPortersMilkSummary)
router.get('/records',verifyToken,authorizeRoles('farmer','manager'), milkController.farmerMilkSummary);
router.get('/monthly',verifyToken, milkController.getAdminPortersMonthlySummary)
router.get('/adminSummary',verifyToken, milkController.getFarmerMonthlySummary)
router.get('/farmerSummary',verifyToken, milkController.downloadMonthlyMilkReport)
router.get('/monthlyPorterSummary',verifyToken, milkController.getMyMonthlyMilkSummary)


module.exports = router
