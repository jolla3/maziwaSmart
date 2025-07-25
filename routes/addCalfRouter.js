// routes/milkRoutes.js
const express = require('express');
const router = express.Router();
const addCalfController = require("../controllers/addCalfConroller");
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// router.get('/all', verifyToken, CowSummaryController.CowSummaryController);
router.post("/", verifyToken,addCalfController.addCalf)
router.get("/:id", verifyToken,addCalfController.getCowFamilyTree)

module.exports = router
