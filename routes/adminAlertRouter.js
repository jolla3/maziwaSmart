const router = require("express").Router();
const {
  getAlerts,
  getAlertById,
  updateAlertStatus,
  deleteAlert
} = require("../controllers/adminAlertController");

const { authorizeRoles , verifyToken} = require("../middleware/authMiddleware");

router.get("/",verifyToken, authorizeRoles("superadmin"), getAlerts);
router.get("/:id", verifyToken,authorizeRoles("superadmin"), getAlertById);
router.patch("/:id",verifyToken, authorizeRoles("superadmin"), updateAlertStatus);
router.delete("/:id", verifyToken,authorizeRoles("superadmin"), deleteAlert);

module.exports = router;
