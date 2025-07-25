const express = require('express');
const router = express.Router();
const milkController = require('../controllers/porterMilkSummaryController.js');
const { verifyToken ,authorizeRoles} = require('../middleware/authMiddleware');

router.get('/', milkController.getPortersMilkSummary)
router.get('/records',verifyToken,authorizeRoles('farmer'), milkController.farmerMilkSummary);
router.get('/monthly',verifyToken, milkController.getMonthlyPorterMilkSummary)
router.get('/adminSummary',verifyToken, milkController.getAdminMilkCollectionSummary)
router.get('/farmerSummary',verifyToken, milkController.getFarmerMonthlySummary)

module.exports = router
