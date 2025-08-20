const { Insemination, Cow } = require('../models/model');
const Tesseract = require('tesseract.js');
const path = require('path');
const stringSimilarity = require('string-similarity');
const chrono = require('chrono-node');
const sharp = require('sharp');

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
exports.handleOCRUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '❌ No image uploaded' });
    }

    const imagePath = req.file.path;
    const farmerCode = req.user.code;

    // --- Validate Image Size ---
    const metadata = await sharp(imagePath).metadata();
    if (metadata.width < 200 || metadata.height < 200) {
      console.error('❌ Image too small:', metadata);
      return res.status(400).json({ message: '❌ Image resolution too low. Please upload a higher-quality image.' });
    }

    // --- Respond Early to Avoid Timeout ---
    res.status(202).json({
      message: '⏳ OCR processing started',
      file: imagePath,
    });

    // --- Enhanced Image Preprocessing ---
    const processedPath = path.join(path.dirname(imagePath), `processed-${path.basename(imagePath)}`);
    try {
      await sharp(imagePath)
        .rotate() // Auto-rotate based on EXIF data
        .resize({ width: 2500, height: 2500, fit: 'contain', background: { r: 255, g: 255, b: 255 } }) // Larger size
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1, m1: 0, m2: 3 }) // Stronger sharpening
        .threshold(100) // Adjusted threshold for better contrast
        .toFile(processedPath);
      console.log('📷 Preprocessed image saved at:', processedPath);
    } catch (sharpError) {
      console.error('❌ Image preprocessing error:', sharpError.message);
      return;
    }

    // --- Improved OCR Configuration ---
    const { data: { text } } = await Tesseract.recognize(processedPath, 'eng', {
      tessedit_pageseg_mode: 3, // Auto page segmentation
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/ :.',
      preserve_interword_spaces: 1,
      tessedit_ocr_engine_mode: 1, // LSTM engine
    });
    console.log('📄 Extracted Text:', text);

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // --- Helper: Fuzzy Extraction with Stricter Validation ---
    const extractNearLabel = (labels, maxLength = 50, minLength = 2) => {
      for (let i = 0; i < lines.length; i++) {
        for (const label of labels) {
          const lineLower = lines[i].toLowerCase();
          const labelLower = label.toLowerCase();
          if (
            stringSimilarity.compareTwoStrings(lineLower, labelLower) > 0.75 ||
            lineLower.includes(labelLower.slice(0, 4))
          ) {
            let cleaned = lines[i].replace(/[^a-zA-Z0-9\s\-/.:]/g, '').trim();
            if (
              cleaned &&
              cleaned.length >= minLength &&
              cleaned.length <= maxLength &&
              !/avoid|heat|comfort|insemination|clinicals|services|priority/i.test(cleaned)
            ) {
              return cleaned;
            }
            // Check next line as fallback
            if (i + 1 < lines.length) {
              cleaned = lines[i + 1].replace(/[^a-zA-Z0-9\s\-/.:]/g, '').trim();
              if (
                cleaned &&
                cleaned.length >= minLength &&
                cleaned.length <= maxLength &&
                !/avoid|heat|comfort|insemination|clinicals|services|priority/i.test(cleaned)
              ) {
                return cleaned;
              }
            }
          }
        }
      }
      return null;
    };

    const safeExtract = (field, labels) => {
      const value = extractNearLabel(labels);
      console.log(`🔎 Extracted ${field}:`, value || 'null');
      return value;
    };

    // --- Field Extraction ---
    const farmerName = safeExtract('Farmer', ['Farmer', 'Farm', 'Owner']);

    // Cow Name (Regex + Fallback)
    let cowNameRaw = null;
    const animalMatch = text.match(/(?:Animal|Cow|Name)\s*[:\-]?\s*([A-Za-z0-9\s]{2,30})/i);
    if (animalMatch && animalMatch[1].length <= 30) {
      cowNameRaw = animalMatch[1].trim();
      console.log('🔎 Cow Name (regex):', cowNameRaw);
    } else {
      cowNameRaw = safeExtract('Cow Name', ['Animal', 'Cow', 'Name', 'Ear No']);
    }

    // Bull Breed
    const bullBreed = safeExtract('Bull Breed', ['Breed', 'Bull', 'Sire']);

    // Technician
    const technician = safeExtract('Technician', ['Inseminator', 'Technician', 'Vet', 'Seminator']);

    // Insemination Date
    let inseminationDateRaw = safeExtract('Insemination Date', ['Insemination Date', 'Date', 'Year', 'Month']);
    let inseminationDate = null;
    if (inseminationDateRaw) {
      const cleanedDate = inseminationDateRaw.replace(/[^0-9\s\-/:.]/g, '').trim();
      inseminationDate = chrono.parseDate(cleanedDate) || chrono.parseDate(cleanedDate, { forwardDate: true });
      // Custom date parsing fallback
      if (!inseminationDate) {
        const dateMatch = cleanedDate.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
        if (dateMatch) {
          const [_, day, month, year] = dateMatch;
          const fullYear = year.length === 2 ? `20${year}` : year; // Assume 20XX for two-digit years
          inseminationDate = new Date(`${fullYear}-${month}-${day}`);
          if (isNaN(inseminationDate.getTime())) {
            inseminationDate = null;
          }
        }
      }
      console.log('🔎 Parsed Date:', inseminationDate ? inseminationDate.toISOString() : 'null');
    }

    // Notes
    const notes = text;

    // --- Validation ---
    if (!cowNameRaw) {
      console.error('❌ Cow name not detected in OCR text.');
      return;
    }

    const cowName = cowNameRaw.trim();
    if (!inseminationDate) {
      console.warn('⚠️ Insemination Date not detected. Using current date as fallback.');
      inseminationDate = new Date();
    }

    // --- Database Query ---
    let cow = null;
    try {
      cow = await Cow.findOne({
        cow_name: { $regex: new RegExp(`^${cowName}$`, 'i') },
        farmer_code: farmerCode,
      }).maxTimeMS(5000);
    } catch (dbError) {
      console.error('❌ Database error during cow lookup:', dbError.message);
      return;
    }

    // Fuzzy match fallback
    let possibleCows = [];
    if (!cow) {
      try {
        possibleCows = await Cow.find({ farmer_code: farmerCode })
          .select('cow_name')
          .lean()
          .maxTimeMS(5000);
        const cowNames = possibleCows.map(c => c.cow_name);

        if (cowNames.length > 0) {
          const match = stringSimilarity.findBestMatch(cowName, cowNames);
          if (match.bestMatch.rating > 0.75) {
            cow = await Cow.findOne({
              cow_name: match.bestMatch.target,
              farmer_code: farmerCode,
            }).maxTimeMS(5000);
          }
        }
      } catch (dbError) {
        console.error('❌ Database error during fuzzy match:', dbError.message);
        possibleCows = []; // Ensure possibleCows is defined
      }
    }

    if (!cow) {
      console.error('❌ Cow not found for this farmer', {
        extractedCowName: cowName,
        suggestion: possibleCows.map(c => c.cow_name),
      });
      return;
    }

    // --- Save Insemination Record ---
    const record = new Insemination({
      cow_id: cow._id,
      farmer_code: farmerCode,
      insemination_date: inseminationDate,
      bull_breed: bullBreed || 'Unknown',
      inseminator: technician || 'Unknown',
      notes,
    });

    await record.save();
    console.log('✅ OCR extraction & record saved:', record);

  } catch (error) {
    console.error('❌ Error during OCR:', error.message);
    return;
  }
};