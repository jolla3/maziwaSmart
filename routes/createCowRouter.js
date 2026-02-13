// routes/milkRoutes.js
const express = require('express');
const router = express.Router();
const CowController = require('../controllers/createCowController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const cron= require('../cron/updateCowStages');

// router.post('/', verifyToken,CowController.createCow);
// router.get('/', verifyToken, CowController.getMyCows);
// router.put('/:id', verifyToken, CowController.updateCow);
router.post('/:id', verifyToken, CowController.addCowLitres);


router.get('/daily/:id', verifyToken,CowController.getCowLitresSummary);
router.get('/weekly/:id', verifyToken, CowController.getCowLast7Days);
router.get('/monthly/:id', verifyToken,CowController. getCowMonthlyTotal);
router.get('/trend/:id', verifyToken, CowController.getCowWeeklyTrend);

// router.get('/all', verifyToken, CowController.getFarmerDailySummary);

module.exports = router
