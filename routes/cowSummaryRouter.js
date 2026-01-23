// routes/milkRoutes.js
const express = require('express');
const router = express.Router();
const CowSummaryController = require("../controllers/cowSummaryController");
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// router.get('/all', verifyToken, CowSummaryController.CowSummaryController);
// router.get("/all", verifyToken,CowSummaryController.getFarmerDailySummary)
router.get("/", verifyToken,CowSummaryController.getFarmerMilkSummary)
module.exports = router
