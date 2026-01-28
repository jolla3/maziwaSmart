const { Insemination, Cow , Breed,Notification} = require('../models/model');
const Tesseract = require('tesseract.js');
const path = require('path');
const stringSimilarity = require('string-similarity');
const chrono = require('chrono-node');
const sharp = require('sharp');


exports.uploadInseminationImage = async (req, res) => {
  try {
    // Get the path of the uploaded image
    const imagePath = req.file.path;

    // Run OCR on the image to extract text
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
    console.log(`Extracted text from image: ${text}`);

    // Return JSON response so client doesn’t timeout
    return res.status(200).json({
      message: "OCR completed successfully",
      raw_text: text,
      file_path: imagePath
    });

  } catch (error) {
    console.error(`Error occurred while processing image: ${error}`);
    return res.status(500).json({
      message: "Failed to process image",
      error: error.message
    });
  }
};

exports.handleOCRUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Run OCR
    const { data: { text } } = await Tesseract.recognize(req.file.path, "eng");
    console.log("📄 OCR Text:", text);

    let cow_name = null;

    // 1️⃣ Try regex extraction (Name: Mercy)
    const nameRegex = text.match(/(?:Name|Cow)\s*[:\-]?\s*([A-Za-z]{3,})/i);
    if (nameRegex) {
      cow_name = nameRegex[1].trim();
    }

    // 2️⃣ If regex fails, do fuzzy match with DB cows
    if (!cow_name) {
      const cows = await Cow.find({ farmer_code: req.user.code }); 
      const cowNames = cows.map(c => c.cow_name);

      const match = stringSimilarity.findBestMatch(text, cowNames);
      if (match.bestMatch.rating > 0.5) {
        cow_name = match.bestMatch.target;
      }
    }

    if (!cow_name) {
      return res.status(400).json({ error: "Could not extract cow name from card" });
    }

    // Find the cow in DB
    const cowDoc = await Cow.findOne({ cow_name, farmer_code: req.user.code });
    if (!cowDoc) {
      return res.status(404).json({ error: "Cow not found in database. Please register cow first." });
    }

    // Extract bull + inseminator
    const bullCodeMatch = text.match(/Bull\s*code\s*[:\-]?\s*([A-Za-z0-9]+)/i);
    const bullBreedMatch = text.match(/Breed\s*[:\-]?\s*([A-Za-z]+)/i);
    const inseminatorMatch = text.match(/Inseminator\s*[:\-]?\s*([A-Za-z ]+)/i);

    // Extract date
    const dateMatch = text.match(/(\d{2,4}[\/\-\s]\d{1,2}[\/\-\s]\d{1,2})/);
    let inseminationDate = null;
    if (dateMatch) {
      inseminationDate = new Date(dateMatch[1]);
    }
    if (!inseminationDate || isNaN(inseminationDate)) {
      console.warn("⚠️ Could not parse insemination date from OCR. Using today.");
      inseminationDate = new Date();
    }

    // Build insemination record
    const inseminationData = {
      cow_id: cowDoc._id,
      farmer_code: req.user.code,
      cow_name,
      bull_code: bullCodeMatch ? bullCodeMatch[1] : null,
      bull_breed: bullBreedMatch ? bullBreedMatch[1] : null,
      inseminator: inseminatorMatch ? inseminatorMatch[1].trim() : null,
      insemination_date: inseminationDate,
    };

    const record = new Insemination(inseminationData);
    await record.save();

    res.status(201).json({ message: "Insemination record saved", record });

  } catch (err) {
    console.error("OCR Handler Error:", err);
    res.status(500).json({ error: "Failed to process insemination card" });
  }
};


exports.addInseminationRecord = async (req, res) => {
  try {
    const {
      animal_id,
      insemination_date,
      inseminator,
      bull_code,
      bull_name,
      bull_breed,
      notes
    } = req.body;

    const farmer_code = req.user.code;
    const farmer_id = req.user._id || req.user.id;

    const animal = await Cow.findOne({ _id: animal_id, farmer_code });
    if (!animal) {
      return res.status(404).json({ message: "Animal not found or unauthorized" });
    }

    if (animal.gender !== "female") {
      return res.status(400).json({ message: "Only female animals can be inseminated" });
    }

    const inseminationDate = insemination_date
      ? new Date(insemination_date)
      : new Date();

    if (isNaN(inseminationDate)) {
      return res.status(400).json({ message: "Invalid insemination_date" });
    }

    const record = new Insemination({
      cow_id: animal._id,
      farmer_code,
      cow_name: animal.cow_name,
      insemination_date: inseminationDate,
      inseminator,
      bull_code,
      bull_name,
      bull_breed,
      outcome: "pregnant",
      notes
    });

    await record.save(); // 🔥 hook does the rest

    if (bull_breed) {
      await Breed.updateOne(
        { farmer_id, breed_name: bull_breed, species: animal.species },
        {
          $setOnInsert: {
            breed_name: bull_breed,
            species: animal.species,
            farmer_id,
            description: `Auto-added from insemination`
          }
        },
        { upsert: true }
      );
    }

    res.status(201).json({
      success: true,
      message: "Insemination recorded",
      record_id: record._id
    });

  } catch (error) {
    console.error("❌ addInseminationRecord:", error);
    res.status(500).json({ message: "Failed to add insemination record" });
  }
};


exports.getInseminationRecords = async (req, res) => { 
  try {
    const farmer_code = req.user.code;

    const records = await Insemination.find({ farmer_code })
      .populate("cow_id", "cow_name tag_id status species") // ✅ use cow_id here
      .sort({ insemination_date: -1 });

    // 🧹 Clean response
    const formatted = records.map(r => ({
      id: r._id,
      animal: r.cow_id ? {
        id: r.cow_id._id,
        name: r.cow_id.cow_name,
        tag: r.cow_id.tag_id,
        species: r.cow_id.species,
        status: r.cow_id.status
      } : null,
      insemination_date: r.insemination_date,
      expected_due_date: r.expected_due_date,
      inseminator: r.inseminator,
      bull: {
        code: r.bull_code,
        name: r.bull_name,
        breed: r.bull_breed
      },
      outcome: r.outcome,
      notes: r.notes,
      has_calved: r.has_calved
    }));

    res.status(200).json({ success: true, count: formatted.length, records: formatted });
  } catch (error) {
    console.error("❌ Error fetching insemination records:", error);
    res.status(500).json({ success: false, message: "Failed to fetch insemination records", error: error.message });
  }
};

// controllers/inseminationController.js
exports.deleteInseminationRecord = async (req, res) => {
  try {
    const farmer_code = req.user.code;
    const { id } = req.params;

    const record = await Insemination.findOne({ _id: id, farmer_code });
    if (!record) {
      return res.status(404).json({ message: "Record not found" });
    }

    if (record.has_calved) {
      return res.status(400).json({ message: "Cannot delete after calving" });
    }

    // If this insemination is the active pregnancy
    const cow = await Cow.findOne({
      _id: record.cow_id,
      "pregnancy.insemination_id": record._id
    });

    if (cow) {
      await Cow.findByIdAndUpdate(cow._id, {
        $set: {
          "pregnancy.is_pregnant": false,
          "pregnancy.insemination_id": null,
          "pregnancy.expected_due_date": null,
          status: "active"
        }
      });
    }

    await Insemination.deleteOne({ _id: id });

    res.status(200).json({ message: "Insemination record deleted" });

  } catch (error) {
    console.error("❌ deleteInseminationRecord:", error);
    res.status(500).json({ message: "Failed to delete record" });
  }
};

exports.updateInseminationRecord = async (req, res) => {
  try {
    const farmer_code = req.user.code;
    const { id } = req.params;
    const updates = req.body;

    const record = await Insemination.findOneAndUpdate(
      { _id: id, farmer_code },
      { $set: updates },
      { new: true }
    );

    if (!record) return res.status(404).json({ message: "Record not found" });

    // if outcome is updated to not_pregnant, reset cow pregnancy
    if (updates.outcome === "not_pregnant") {
      await Cow.findByIdAndUpdate(record.cow_id, {
        $set: { pregnancy: { is_pregnant: false }, status: "available" }
      });
    }

    res.status(200).json({ message: "Record updated", record });
  } catch (error) {
    console.error("❌ Error updating insemination record:", error);
    res.status(500).json({ message: "Failed to update insemination record", error: error.message });
  }
};

// 🟢 Get single insemination record
exports.getInseminationRecordById = async (req, res) => {
  try {
    const { id } = req.params;
    const farmer_code = req.user.code;

    const record = await Insemination.findOne({ _id: id, farmer_code })
      .populate("cow_id", "cow_name tag_id status");

    if (!record) {
      return res.status(404).json({ success: false, message: "Insemination record not found" });
    }

    // 🧹 Clean response
    const formatted = {
      id: record._id,
      cow: record.cow_id ? {
        id: record.cow_id._id,
        name: record.cow_id.cow_name,
        tag: record.cow_id.tag_id,
        status: record.cow_id.status
      } : null,
      insemination_date: record.insemination_date,
      expected_due_date: record.expected_due_date,
      inseminator: record.inseminator,
      bull: {
        code: record.bull_code,
        name: record.bull_name,
        breed: record.bull_breed
      },
      outcome: record.outcome,
      notes: record.notes,
      has_calved: record.has_calved,
      calf_id: record.calf_id,
      created_at: record.created_at
    };

    res.status(200).json({ success: true, record: formatted });
  } catch (error) {
    console.error("❌ Error fetching insemination record:", error);
    res.status(500).json({ success: false, message: "Failed to fetch insemination record", error: error.message });
  }
};
