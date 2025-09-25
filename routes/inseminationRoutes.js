const express = require('express');
const router = express.Router();
const makeUploader = require('../middleware/upload'); // <-- make sure the path points to your utils folder
const { verifyToken } = require('../middleware/authMiddleware');

const {
  addInseminationRecord,
  handleOCRUpload,
  getInseminationRecords,
  getInseminationRecordById,
  updateInseminationRecord,
  deleteInseminationRecord
} = require('../controllers/inseminationController');

// Create Multer instance specifically for insemination uploads
const inseminationUpload = makeUploader('insemination');

// -------------------------
// Manual entry routes
// -------------------------
router.post('/', verifyToken, addInseminationRecord);
router.get('/', verifyToken, getInseminationRecords);
router.get('/:id', verifyToken, getInseminationRecordById);
router.put('/:id', verifyToken, updateInseminationRecord);
router.delete('/:id', verifyToken, deleteInseminationRecord);

// -------------------------
// OCR photo upload route
// -------------------------
router.post('/upload-card', verifyToken, inseminationUpload.single('photo'), handleOCRUpload);

module.exports = router;
