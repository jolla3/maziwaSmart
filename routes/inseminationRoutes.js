const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { verifyToken } = require('../middleware/authMiddleware');

const {
  addInseminationRecord,
  handleOCRUpload,
  getInseminationRecords,
  getInseminationRecordById,
  updateInseminationRecord,
  deleteInseminationRecord
} = require('../controllers/inseminationController');

// Manual entry route (form)
router.post('/', verifyToken, addInseminationRecord);
router.get('/', verifyToken, getInseminationRecords);
router.get('/:id', verifyToken,  getInseminationRecordById);
router.put('/:id', verifyToken, updateInseminationRecord);
router.delete('/:id', verifyToken, deleteInseminationRecord);

// OCR photo upload route
router.post('/upload-card', verifyToken, upload.single('photo'), handleOCRUpload);

module.exports = router
