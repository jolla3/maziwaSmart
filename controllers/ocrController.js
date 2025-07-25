const tesseract = require('tesseract.js');
const path = require('path');

// 📸 OCR + Image parsing logic
exports.extractTextFromImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '❌ No image file uploaded.' });
    }

    const imagePath = req.file.path;
    console.log('📄 OCR processing file:', imagePath);

    const { data: { text } } = await tesseract.recognize(imagePath, 'eng');

    res.status(200).json({
      message: '✅ OCR processing successful.',
      extracted_text: text
    });
  } catch (error) {
    console.error('❌ OCR error:', error.message);
    res.status(500).json({ message: 'OCR processing failed.', error: error.message });
  }
};
