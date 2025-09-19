// routes/milkRoutes.js
const express = require('express');
const router = express.Router();
const AnimalController = require("../controllers/AnimalController");
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

router.post('/', verifyToken, AnimalController.createAnimal)
// router.get("/", verifyToken,milkAnomaliesController.addMilkRecord)
// router.get("/:id", verifyToken,addCalfController.getCowFamilyTree)
// router.get('/', verifyToken,milkAnomaliesController.getDailyMilkSummaryForAdmin )

module.exports = router
