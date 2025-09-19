// routes/anomalyRoutes.js
const express = require('express');
const router = express.Router();
const anomalyController = require('../controllers/anomalyController');
const { verifyToken,authorizeRoles } = require('../middleware/authMiddleware'); 
// 👆 adjust this to match your actual auth middleware

// 📌 Get anomalies for logged-in farmer
router.get('/', verifyToken, anomalyController.getAnomalies);

// 📌 Resolve an anomaly slot (PATCH)
router.patch('/:anomalyId/resolve', verifyToken, anomalyController.resolveAnomaly);

// 📌 Delete anomaly (optional cleanup)
router.delete('/:anomalyId', verifyToken, anomalyController.deleteAnomaly);

module.exports = router;
