// routes/milkRoutes.js
const express = require('express');
const router = express.Router();
const porterDashStatController = require("../controllers/porterDashStatsController");
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// router.get('/all', verifyToken, CowSummaryController.CowSummaryController);
router.get("/", verifyToken,porterDashStatController.porterDashStats)
// router.get("/:id", verifyToken,addCalfController.getCowFamilyTree)

module.exports = router
