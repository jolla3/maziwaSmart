// controllers/anomalyController.js
const { MilkAnomaly, Cow, Notification } = require('../models/model');

// 📌 Get anomalies for a farmer (optionally filter by animal)
exports.getAnomalies = async (req, res) => {
  try {
    const { farmer_code } = req.user;   // from auth middleware
    const { animal_id } = req.query;    // optional filter

    const filter = { farmer_code };
    if (animal_id) filter.animal_id = animal_id;

    const anomalies = await MilkAnomaly.find(filter)
      .populate('animal_id', 'cow_name species')
      .sort({ anomaly_date: -1 });

    res.json({ success: true, count: anomalies.length, data: anomalies });
  } catch (err) {
    console.error('❌ Error fetching anomalies:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch anomalies', error: err.message });
  }
};

// 📌 Resolve a specific anomaly slot
exports.resolveAnomaly = async (req, res) => {
  try {
    const { anomalyId } = req.params;      // anomaly doc ID
    const { time_slot } = req.body;        // which slot inside anomaly_slots

    const anomaly = await MilkAnomaly.findById(anomalyId);
    if (!anomaly) return res.status(404).json({ success: false, message: 'Anomaly not found' });

    if (!time_slot || !anomaly.anomaly_slots.has(time_slot)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing time_slot' });
    }

    // Mark each anomaly entry in that slot as resolved
    const entries = anomaly.anomaly_slots.get(time_slot);
    entries.forEach(entry => {
      entry.resolved = true;
      entry.resolved_at = new Date();
    });
    anomaly.anomaly_slots.set(time_slot, entries);
    await anomaly.save();

    // Optional: notify farmer
    await Notification.create({
      farmer_code: anomaly.farmer_code,
      cow: anomaly.animal_id,
      type: 'milk_anomaly',
      message: `✅ Anomaly on ${time_slot} (${anomaly.anomaly_date.toDateString()}) has been resolved.`,
      sent_at: new Date()
    });

    res.json({ success: true, message: 'Anomaly resolved', data: anomaly });
  } catch (err) {
    console.error('❌ Error resolving anomaly:', err);
    res.status(500).json({ success: false, message: 'Failed to resolve anomaly', error: err.message });
  }
};

// 📌 Delete anomaly (optional cleanup)
exports.deleteAnomaly = async (req, res) => {
  try {
    const { anomalyId } = req.params;
    const deleted = await MilkAnomaly.findByIdAndDelete(anomalyId);

    if (!deleted) return res.status(404).json({ success: false, message: 'Anomaly not found' });

    res.json({ success: true, message: 'Anomaly deleted' });
  } catch (err) {
    console.error('❌ Error deleting anomaly:', err);
    res.status(500).json({ success: false, message: 'Failed to delete anomaly', error: err.message });
  }
};
