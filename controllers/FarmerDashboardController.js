// controllers/farmerController.js
const asyncHandler = require("../utils/asyncHandler");
const { getFarmerDashboard } = require("../services/farmerService");
const { logger } = require("../utils/logger");

exports.farmerDashboard = asyncHandler(async (req, res) => {
  const role = (req.user?.role || "").toLowerCase();
  if (!(role === "farmer" || role === "manager")) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  try {
    const dashboard = await getFarmerDashboard(req.user);
    return res.status(200).json({
      success: true,
      message: "Dashboard loaded successfully",
      data: dashboard,
    });
  } catch (err) {
    logger.error(`Failed to load farmer dashboard: ${err.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard",
    });
  }
});
