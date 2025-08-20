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
}


// ocr picture scaning
// ocr picture scaning
exports.uploadInseminationImage = async (req, res) => {
  try {
    const imagePath = req.file.path;

    // Run OCR
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
    console.log("📄 Extracted Text:", text);

    
    // Return JSON response so client doesn’t timeout
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


const stringSimilarity = require('string-similarity');
const chrono = require('chrono-node'); // ✅ for smart date parsing

exports.handleOCRUpload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: '❌ No image uploaded' });

    const imagePath = req.file.path;
    const farmerCode = req.user.code;

    // ✅ OCR Read with whitelist (helps messy handwriting)
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng', {
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/- ',
    });
    console.log('Extracted Text:', text);

    // --- Helper: regex-based extraction (for labels like Breed: XYZ)
    const extract = (label) => {
      const match = text.match(new RegExp(`${label}\\s*[:\\-]?\\s*(.+)`, 'i'));
      return match ? match[1].trim() : null;
    };

    // --- Helper: line-based extraction (handles multi-word cow names)
    const getValueAfterKeyword = (text, keywords) => {
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        for (const keyword of keywords) {
          if (lines[i].toLowerCase().includes(keyword.toLowerCase())) {
            const parts = lines[i].split(/\s+/);
            const idx = parts.findIndex(p =>
              p.toLowerCase().includes(keyword.toLowerCase())
            );

            // ✅ return all words after the keyword on same line
            if (idx !== -1 && parts[idx + 1]) return parts.slice(idx + 1).join(" ");

            // ✅ otherwise take the full next line (multi-word safe)
            if (lines[i + 1]) return lines[i + 1];
          }
        }
      }
      return null;
    };

    // Try to extract values
    const cowNameRaw = extract('Cow Name') || extract('Cow') || getValueAfterKeyword(text, ['Animal', 'Name']);
    const inseminationDateRaw = extract('Insemination Date') || extract('Date');
    const bullBreed = extract('Bull Breed') || extract('Breed');
    const technician = extract('Technician') || extract('Vet') || extract('Inseminator');
    const notes = text;

    // ✅ Robust date parsing
    const inseminationDate = inseminationDateRaw ? chrono.parseDate(inseminationDateRaw) : null;

    // ✅ Cow name processing
    const cowName = cowNameRaw ? cowNameRaw.trim() : null;
    if (!cowName) {
      return res.status(400).json({ message: '❌ Cow name not detected in OCR text.' });
    }

    // Try direct match
    let cow = await Cow.findOne({
      cow_name: { $regex: new RegExp(`^${cowName}$`, 'i') },
      farmer_code: farmerCode
    });

    // If no direct match, try fuzzy match
    if (!cow) {
      const possible = await Cow.find({ farmer_code: farmerCode }).select('cow_name');
      const cowNames = possible.map(c => c.cow_name);

      const match = stringSimilarity.findBestMatch(cowName, cowNames);
      if (match.bestMatch.rating > 0.6) {
        cow = await Cow.findOne({
          cow_name: match.bestMatch.target,
          farmer_code: farmerCode
        });
      }

      if (!cow) {
        return res.status(404).json({
          message: '❌ Cow not found for this farmer',
          extractedCowName: cowName,
          suggestion: cowNames
        });
      }
    }

    if (!inseminationDate) {
      return res.status(400).json({ message: '❌ Insemination Date not detected or invalid in OCR' });
    }

    // ✅ Save record
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
