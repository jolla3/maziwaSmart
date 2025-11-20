const router = require("express").Router();
const { authorizeRoles } = require("../middleware/authMiddleware");
const { getAuditLogs, getAuditById } = require("../controllers/adminAuditController");

router.get("/", authorizeRoles("superadmin"), getAuditLogs);
router.get("/:id", authorizeRoles("superadmin"), getAuditById);

module.exports = router;
