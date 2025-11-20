const Config = require("../models/MonitoringConfig");

exports.getConfig = async (req, res) => {
  try {
    const config = await Config.find({});
    res.json(config);
  } catch {
    res.status(500).json({ error: "Failed to load config" });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const updates = req.body;

    for (const key of Object.keys(updates)) {
      await Config.findOneAndUpdate(
        { key },
        { value: updates[key], updatedAt: new Date() },
        { upsert: true }
      );
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to update config" });
  }
};
