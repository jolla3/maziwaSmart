const {Farmer,MilkRecord,Porter,PorterLog,DailyMilkSummary} = require('../models/model');

// 🚀 Add Milk Record

// 🚀 Add Milk Record - FIXED VERSION
exports.addMilkRecord = async (req, res) => {
  try {
    if (req.user.role !== "porter") {
      return res.status(403).json({ 
        success: false,
        message: "Only porters can add milk records" 
      });
    }

    const { farmer_code, litres } = req.body;

    // Input validation
    if (!farmer_code || !litres) {
      return res.status(400).json({
        success: false,
        message: "Farmer code and litres are required"
      });
    }

    if (litres <= 0) {
      return res.status(400).json({
        success: false,
        message: "Litres must be greater than 0"
      });
    }

    // 1️⃣ Validate farmer
    const farmer = await Farmer.findOne({ farmer_code: parseInt(farmer_code) });
    if (!farmer) {
      return res.status(404).json({ 
        success: false,
        message: "Farmer not found" 
      });
    }

    // 2️⃣ Determine time slot - FIXED to match schema
    const now = new Date();
    const hour = now.getHours();
    const time_slot =
      hour >= 5 && hour < 10
        ? "morning"
        : hour >= 10 && hour < 12
        ? "midmorning" 
        : hour >= 12 && hour < 17
        ? "afternoon"
        : "evening";

    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    // 3️⃣ Find existing record for same farmer, porter, slot, and day
    let existingRecord = await MilkRecord.findOne({
      farmer_code: parseInt(farmer_code),
      time_slot,
      created_by: req.user.id,
      collection_date: { $gte: startOfDay, $lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000) }
    });

    // Get porter info once
    const porter = await Porter.findById(req.user.id).select("name");
    if (!porter) {
      return res.status(404).json({ 
        success: false,
        message: "Porter not found" 
      });
    }

    // 4️⃣ HANDLE EXISTING RECORD (UPDATE SCENARIO)
    if (existingRecord) {
      // Check if porter has already used their 1 update
      if (existingRecord.update_count >= 1) {
        return res.status(400).json({
          success: false,
          message: `Update limit reached! You can only update farmer ${farmer_code}'s record once per ${time_slot} slot today.`,
          details: {
            current_litres: existingRecord.litres,
            updates_used: existingRecord.update_count,
            max_updates: 1,
            farmer_name: farmer.fullname,
            time_slot: time_slot
          }
        });
      }

      const oldLitres = existingRecord.litres;
      const litreDifference = parseFloat(litres) - oldLitres;

      // Update the record
      existingRecord.litres = parseFloat(litres);
      existingRecord.update_count = existingRecord.update_count + 1;
      await existingRecord.save();

      // ✅ FIXED: Update summary with difference only (no conflict)
      await DailyMilkSummary.findOneAndUpdate(
        {
          summary_date: startOfDay,
          porter_id: req.user.id,
          farmer_code: parseInt(farmer_code),
          time_slot
        },
        { $inc: { total_litres: litreDifference } }
      );

      // Log update activity
      await PorterLog.create({
        porter_id: req.user.id,
        porter_name: req.user.name,
        activity_type: "update-collection",
        log_date: now,
        litres_collected: parseFloat(litres),
        remarks: `UPDATED: ${farmer.fullname} (${farmer_code}) from ${oldLitres}L to ${litres}L (${time_slot}). Updates remaining: ${1 - existingRecord.update_count}`
      });

      return res.status(200).json({
        success: true,
        message: `✅ Record updated successfully! You have ${1 - existingRecord.update_count} update${1 - existingRecord.update_count !== 1 ? 's' : ''} remaining for today.`,
        data: {
          record: existingRecord,
          farmer_name: farmer.fullname,
          previous_litres: oldLitres,
          new_litres: parseFloat(litres),
          difference: litreDifference > 0 ? `+${litreDifference}L` : `${litreDifference}L`,
          updates_remaining: 1 - existingRecord.update_count,
          time_slot: time_slot,
          action: "updated"
        }
      });
    }

    // 5️⃣ CREATE NEW RECORD (FIRST-TIME ENTRY)
    const newRecord = await MilkRecord.create({
      created_by: req.user.id,
      farmer: farmer._id,
      farmer_code: parseInt(farmer_code),
      litres: parseFloat(litres),
      collection_date: now,
      time_slot,
      update_count: 0
    });

    // Log collection activity
    await PorterLog.create({
      porter_id: req.user.id,
      porter_name: req.user.name,
      activity_type: "collection",
      log_date: now,
      litres_collected: parseFloat(litres),
      remarks: `NEW COLLECTION: ${farmer.fullname} (${farmer_code}) - ${litres}L (${time_slot})`
    });

    // ✅ FIXED: Handle daily summary creation/update properly
    try {
      // First, try to find existing summary
      const existingSummary = await DailyMilkSummary.findOne({
        summary_date: startOfDay,
        porter_id: req.user.id,
        farmer_code: parseInt(farmer_code),
        time_slot
      });

      if (existingSummary) {
        // Update existing summary
        existingSummary.total_litres += parseFloat(litres);
        await existingSummary.save();
      } else {
        // Create new summary
        await DailyMilkSummary.create({
          porter_id: req.user.id,
          porter_name: porter.name,
          summary_date: startOfDay,
          time_slot,
          farmer_code: parseInt(farmer_code),
          total_litres: parseFloat(litres)
        });
      }
    } catch (summaryError) {
      console.warn("Summary update failed (non-critical):", summaryError.message);
      // Don't fail the whole operation if summary fails
    }

    // Success response for new record
    return res.status(201).json({
      success: true,
      message: `✅ New milk record added successfully!`,
      data: {
        record: newRecord,
        farmer_name: farmer.fullname,
        litres: parseFloat(litres),
        updates_remaining: 1,
        time_slot: time_slot,
        action: "created"
      }
    });

  } catch (error) {
    console.error("❌ Error in addMilkRecord:", error);
    
    // Handle specific MongoDB errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        details: error.message
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate entry detected"
      });
    }

    if (error.code === 40) {
      return res.status(400).json({
        success: false,
        message: "Database conflict error - please try again"
      });
    }

    return res.status(500).json({ 
      success: false,
      message: "Internal server error occurred while processing milk record",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


// 📥 View All Milk Records by Porter

exports.getMyMilkRecords = async (req, res) => {
  try {
    if (req.user.role !== 'porter') {
      return res.status(403).json({ message: 'Access denied: Only porters can view this' });
    }

    const porterId = req.user.id;
    const porter = await Porter.findById(porterId);
    if (!porter) {
      return res.status(404).json({ message: 'Porter not found' });
    }

    // Fetch all milk records created by this porter
    const records = await MilkRecord.find({ created_by: porterId })
      .sort({ collection_date: -1 })
      .lean();

    // Fetch all related farmers
    const farmerCodes = [...new Set(records.map(r => r.farmer_code))];
    const farmers = await Farmer.find({ farmer_code: { $in: farmerCodes } });
    const farmerMap = {};
    farmers.forEach(f => {
      farmerMap[f.farmer_code] = f.fullname;
    });

    // Group by date and then by time_slot
    const groupedByDate = {};

    const getFormattedDate = (date) => {
      const d = new Date(date);
      const day = d.toLocaleDateString('en-KE', { weekday: 'long' });
      const formatted = d.toISOString().split('T')[0];
      return `${day} ${formatted}`; // e.g., "Monday 2025-07-21"
    };

    records.forEach(record => {
      const dateKey = getFormattedDate(record.collection_date);
      const slot = record.time_slot || 'unspecified';

      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = {
          date: dateKey,
          slots: {},
          total_litres_for_date: 0
        };
      }

      if (!groupedByDate[dateKey].slots[slot]) {
        groupedByDate[dateKey].slots[slot] = {
          time_slot: slot,
          records: [],
          total_litres_per_slot: 0
        };
      }

      const entry = {
        farmer_code: record.farmer_code,
        farmer_name: farmerMap[record.farmer_code] || 'Unknown Farmer',
        litres: record.litres
      };

      groupedByDate[dateKey].slots[slot].records.push(entry);
      groupedByDate[dateKey].slots[slot].total_litres_per_slot += record.litres;
      groupedByDate[dateKey].total_litres_for_date += record.litres;
    });

    // Convert to array and structure for response
    const summary = Object.values(groupedByDate).map(dateEntry => ({
      date: dateEntry.date,
      slots: Object.values(dateEntry.slots),
      total_litres_for_date: dateEntry.total_litres_for_date
    }));

    res.status(200).json({
      porter: porter.name,
      summary
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch porter milk summary', error: error.message });
  }
}

// ✏️ Update Milk Record

exports.adminUpdateMilkRecord = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can perform this update' });
    }

    const recordId = req.params.id;
    const { farmer_code, litres, time_slot, collection_date } = req.body;

    // 1. Find the milk record
    const record = await MilkRecord.findById(recordId);
    if (!record) {
      return res.status(404).json({ message: 'Milk record not found' });
    }

    // 2. Verify new farmer exists (if farmer_code is being changed)
    const farmer = await Farmer.findOne({ farmer_code });
    if (!farmer) {
      return res.status(404).json({ message: 'New farmer not found' });
    }

    // 3. Update milk record
    record.farmer_code = farmer_code;
    record.litres = litres;
    record.time_slot = time_slot;
    record.collection_date = collection_date ? new Date(collection_date) : record.collection_date;

    await record.save();

    // 4. Optional: update PorterLog (new entry as an audit trail)
    await PorterLog.create({
      porter_id: record.created_by,
      activity_type: 'collection',
      litres_collected: litres,
      log_date: new Date(),
      remarks: `Admin correction: milk record updated for farmer ${farmer.fullname} (${farmer_code})`,
      created_by: req.user.id // the admin
    });

    res.status(200).json({
      message: 'Milk record updated successfully by admin',
      updated_record: record
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to update milk record',
      error: error.message
    });
  }
}

// ❌ Delete Milk Record
exports.deleteMilkRecord = async (req, res) => {
  try {
    const porterCode = req.user.code;
    const recordId = req.params.id;

    const record = await MilkRecord.findById(recordId);
    if (!record) return res.status(404).json({ message: 'Milk record not found' });

    if (record.porter_code !== porterCode) {
      return res.status(403).json({ message: 'Unauthorized to delete this record' });
    }

    await MilkRecord.findByIdAndDelete(recordId);
    res.status(200).json({ message: 'Milk record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Delete failed', error: error.message });
  }
}