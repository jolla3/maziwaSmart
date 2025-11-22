const Alert = require("../models/Alert");

exports.getAlerts = async (req, res) => {
  try {
    const { status = "open", page = 1, limit = 50 } = req.query;
    const alerts = await Alert.find({ status })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const total = await Alert.countDocuments({ status });
    res.json({ alerts, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    logger.error("getAlerts error:", err);
    res.status(500).json({ error: "Failed to load alerts" });
  }
};

exports.updateAlertStatus = async (req, res) => {
  try {
    const { action } = req.body; // reviewing | close | escalate
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    if (action === "reviewing") alert.status = "reviewing";
    if (action === "close") {
      alert.status = "closed";
      alert.resolvedAt = new Date();
    }
    if (action === "escalate") alert.severity = "high";

    await alert.save();
    res.json({ success: true, alert });
  } catch (err) {
    logger.error("updateAlertStatus error:", err);
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
exports.getAlertById = async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });

    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: "Failed to load alert" });
  }
};
