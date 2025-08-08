// routes/milkRoutes.js
const express = require('express');
const router = express.Router();
const milkAnomaliesController = require("../controllers/mikAnomaliesControllers");
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// router.get('/all', verifyToken, CowSummaryController.CowSummaryController);
// router.get("/", verifyToken,milkAnomaliesController.addMilkRecord)
// router.get("/:id", verifyToken,addCalfController.getCowFamilyTree)
router.get('/milk-summaries', verifyToken,milkAnomaliesController.getDailyMilkSummaryForAdmin )

module.exports = router
