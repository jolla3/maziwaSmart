const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { extractTextFromImage } = require('../controllers/ocrController');

// POST /api/ocr/upload
router.post('/upload', upload.single('image'), extractTextFromImage);

module.exports = router;
