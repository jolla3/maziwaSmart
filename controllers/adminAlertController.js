const Alert = require("../models/Alert");

exports.getAlerts = async (req, res) => {
  try {
    const status = req.query.status || "open";

    const alerts = await Alert.find({ status })
      .sort({ createdAt: -1 });

    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: "Failed to load alerts" });
  }
};

exports.getAlertById = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: "Failed to load alert" });
  }
};

exports.updateAlertStatus = async (req, res) => {
  try {
    const { action } = req.body;

    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    if (action === "reviewing") alert.status = "reviewing";
    if (action === "close") alert.status = "closed";
    if (action === "escalate") alert.severity = "high";

    await alert.save();
    res.json({ success: true, alert });
  } catch (err) {
    res.status(500).json({ error: "Failed to update alert" });
  }
};

exports.deleteAlert = async (req, res) => {
  try {
    await Alert.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete alert" });
  }
};
