const ListingsAudit = require("../models/ListingsAudit");

exports.getAuditLogs = async (req, res) => {
  try {
    const { userId, listingId, action, page = 1 } = req.query;

    const filter = {};
    if (userId) filter.userId = userId;
    if (listingId) filter.listingId = listingId;
    if (action) filter.action = action;

    const perPage = 50;

    const logs = await ListingsAudit.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage);

    res.json(logs);
  } catch {
    res.status(500).json({ error: "Failed to load audit logs" });
  }
};

exports.getAuditById = async (req, res) => {
  try {
    const log = await ListingsAudit.findById(req.params.id);
    if (!log) return res.status(404).json({ error: "Audit entry not found" });

    res.json(log);
  } catch {
    res.status(500).json({ error: "Failed to load audit entry" });
  }
};
