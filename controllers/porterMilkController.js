const {Farmer,MilkRecord,Porter,PorterLog,DailyMilkSummary} = require('../models/model');

// 🚀 Add Milk Record
exports.addMilkRecord = async (req, res) => {
  try {
    if (req.user.role !== 'porter') {
      return res.status(403).json({ message: 'Only porters can add milk records' });
    }

    const { farmer_code, litres } = req.body;

    const farmerExists = await Farmer.findOne({ farmer_code });
    if (!farmerExists) {
      return res.status(404).json({ message: 'Farmer not found' });
    }

    const now = new Date();
    const hour = now.getHours();
    let time_slot = '';
    if (hour < 10) time_slot = 'morning';
    else if (hour < 15) time_slot = 'midmorning';
    else time_slot = 'afternoon';

    const startOfDay = new Date(now.setHours(0, 0, 0, 0));
    const endOfDay = new Date(now.setHours(23, 59, 59, 999));

    // Prevent duplicate for same day/slot/farmer/porter
    const exists = await MilkRecord.findOne({
      created_by: req.user.id,
      farmer_code,
      time_slot,
      collection_date: { $gte: startOfDay, $lte: endOfDay }
    });

    if (exists) {
      return res.status(400).json({ message: 'Milk already collected for this farmer at this time today' })
    }

    // 1. Save Milk Record
    const newRecord = await MilkRecord.create({
      created_by: req.user.id,
      farmer_code,
      litres,
      collection_date: new Date(),
      time_slot
    });

    // 2. Log activity to PorterLog
    await PorterLog.create({
      porter_id: req.user.id,
      porter_name: req.user.name,
      activity_type: 'collection',
      log_date: new Date(),
      litres_collected: litres,
      remarks: `Collected milk from farmer ${farmerExists.fullname} (${farmer_code}) during ${time_slot}`
    });

    // 3. Automatically update daily milk summary
    await DailyMilkSummary.findOneAndUpdate(
      {
        summary_date: startOfDay,
        porter_id: req.user.id,
        farmer_code,
        time_slot
      },
      {
        $setOnInsert: {
          porter_name: req.user.name,
          summary_date: startOfDay,
          time_slot,
          farmer_code,
          porter_id: req.user.id
        },
        $inc: { total_litres: litres }
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      message: 'Milk record added, activity logged, summary updated',
      record: newRecord
    });

 


    // Update or insert into daily milk summary
    await DailyMilkSummary.findOneAndUpdate(
      {
        summary_date: startOfDay,
        porter_id: req.user.id,
        farmer_code,
        time_slot
      },
      {
        $inc: { total_litres: litres },
        $setOnInsert: {
          porter_code: req.user.code || '', // if available
        }
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: 'Milk record added and summary updated', record: newRecord });
  }catch (error) {
    console.error('Error adding milk record:', error);
    res.status(500).json({ message: 'Failed to add milk record', error: error.message });
  }
}

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