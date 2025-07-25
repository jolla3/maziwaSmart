const {Insemination,Cow} = require('../models/model');
const Tesseract = require('tesseract.js');
const path = require('path');

exports.addInseminationRecord = async (req, res) => {
  try {
    const { cow_id, insemination_date, inseminator, bull_breed, notes } = req.body;
    const farmer_code = req.user.code; // from token

    // ✅ Check cow belongs to this farmer
    const cow = await Cow.findOne({ _id: cow_id, farmer_code });

    if (!cow) {
      return res.status(404).json({ message: "🐄 Cow not found or unauthorized" });
    }

    // ✅ Save record
    const record = new Insemination({
      cow_id,
      farmer_code,
      insemination_date,
      inseminator,
      bull_breed,
      notes
    });

    await record.save();

    res.status(201).json({
      message: "✅ Insemination record added successfully",
      data: record
    });

  } catch (error) {
    console.error("❌ Error in addInseminationRecord:", error);
    res.status(500).json({
      message: "❌ Failed to add insemination record",
      error: error.message
    });
  }
};


// ocr picture scaning
exports.uploadInseminationImage = async (req, res) => {
  try {
    const imagePath = req.file.path;

    // 🧠 OCR with Tesseract
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');

    // You can now process the text to auto-fill fields if format is consistent
    console.log("📄 OCR Text Output:", text);

    return res.status(200).json({
      message: "✅ OCR completed",
      raw_text: text,
      file_path: imagePath
    });
  } catch (error) {
    console.error("❌ OCR Error:", error);
    return res.status(500).json({
      message: "❌ Failed to process image",
      error: error.message
    });
  }
};


// controllers/inseminationController.js
const tesseract = require('tesseract.js');
exports.handleOCRUpload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: '❌ No image uploaded' });

    const imagePath = req.file.path;
    const farmerCode = req.user.code;

    // OCR Read
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
    console.log('Extracted Text:', text);

    // Field extraction helper
    const extract = (label) => {
      const match = text.match(new RegExp(`${label}\\s*[:\\-]?\\s*(.+)`, 'i'));
      return match ? match[1].trim() : null;
    };

    const cowNameRaw = extract('Cow Name') || extract('Cow');
    const inseminationDateRaw = extract('Insemination Date') || extract('Date');
    const bullBreed = extract('Bull Breed') || extract('Breed');
    const technician = extract('Technician') || extract('Vet') || extract('Inseminator');
    const notes = text;

    const inseminationDate = inseminationDateRaw ? new Date(inseminationDateRaw) : null;

    // ✅ Trim + regex match cow name
    const cowName = cowNameRaw ? cowNameRaw.trim() : null;
    if (!cowName) {
      return res.status(400).json({ message: '❌ Cow name not detected in OCR text.' });
    }

    const cow = await Cow.findOne({
      cow_name: { $regex: new RegExp(`^${cowName}$`, 'i') }, // case-insensitive, trimmed match
      farmer_code: farmerCode
    });

    if (!cow) {
      const possible = await Cow.find({ farmer_code: farmerCode }).select('cow_name');
      return res.status(404).json({
        message: '❌ Cow not found for this farmer',
        extractedCowName: cowName,
        suggestion: possible.map(c => c.cow_name)
      });
    }

    if (!inseminationDate) {
      return res.status(400).json({ message: '❌ Insemination Date not detected or invalid in OCR' });
    }

    // ✅ Save
    const record = new Insemination({
      cow_id: cow._id,
      farmer_code: farmerCode,
      insemination_date: inseminationDate,
      bull_breed: bullBreed,
      inseminator: technician,
      notes
    });

    await record.save();

    res.status(201).json({
      message: '✅ OCR extraction & data saved.',
      record
    });

  } catch (error) {
    console.error('❌ Error during OCR:', error.message);
    res.status(500).json({ message: 'OCR or save failed.', error: error.message });
  }
};
