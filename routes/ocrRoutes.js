const express = require('express');
const router = express.Router();
const makeUploader = require('../middleware/upload'); // keep this as your factory function
const { extractTextFromImage } = require('../controllers/ocrController');

// Create a Multer instance for OCR uploads
const ocrUpload = makeUploader('ocr'); // folder name "ocr"

// POST /api/ocr/upload
router.post('/upload',  ocrUpload.single('image'), extractTextFromImage);

module.exports = router;
