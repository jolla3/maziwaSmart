const router = require("express").Router();
const {
  getAlerts,
  getAlertById,
  updateAlertStatus,
  deleteAlert
} = require("../controllers/adminAlertController");

const { authorizeRoles } = require("../middleware/authMiddleware");

router.get("/", authorizeRoles("superadmin"), getAlerts);
router.get("/:id", authorizeRoles("superadmin"), getAlertById);
router.patch("/:id", authorizeRoles("superadmin"), updateAlertStatus);
router.delete("/:id", authorizeRoles("superadmin"), deleteAlert);

module.exports = router;
