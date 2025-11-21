const router = require("express").Router();
const { verifyToken,authorizeRoles } = require("../middleware/authMiddleware");
const { getAuditLogs, getAuditById } = require("../controllers/adminAuditController");

router.get("/", verifyToken,authorizeRoles("superadmin"), getAuditLogs);
router.get("/:id",verifyToken, authorizeRoles("superadmin"), getAuditById);

module.exports = router;
