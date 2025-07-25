const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { verifyToken } = require('../middleware/authMiddleware');

const {
  addInseminationRecord,
  handleOCRUpload
} = require('../controllers/inseminationController');

// Manual entry route (form)
router.post('/', verifyToken, addInseminationRecord);

// OCR photo upload route
router.post('/upload-card', verifyToken, upload.single('photo'), handleOCRUpload);

module.exports = router;
