// routes/milkRoutes.js
const express = require('express');
const router = express.Router();
const porterMilkController = require('../controllers/porterMilkController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

router.post('/add', verifyToken, porterMilkController.addMilkRecord);
router.get('/myrecords', verifyToken, porterMilkController.getMyMilkRecords);
// router.put('/update/:id', verifyToken, porterMilkController.updateMilkRecord);
router.delete('/delete/:id', verifyToken, porterMilkController.deleteMilkRecord);
router.put('/update/:id', verifyToken, porterMilkController.adminUpdateMilkRecord);

module.exports = router
