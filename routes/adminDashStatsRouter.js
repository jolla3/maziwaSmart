// routes/milkRoutes.js
const express = require('express');
const router = express.Router();
const adminDashStatsController = require("../controllers/adminDashStatsController");
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// router.get('/all', verifyToken, CowSummaryController.CowSummaryController);
router.get("/", verifyToken,adminDashStatsController.adminDashStats)
// router.get("/:id", verifyToken,addCalfController.getCowFamilyTree)

module.exports = router
