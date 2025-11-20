const router = require("express").Router();
const { getOnlineUsers, getMonitorStats } = require("../controllers/adminMonitorController");
const { authorizeRoles } = require("../middleware/authMiddleware");

router.get("/online-users", authorizeRoles("superadmin"), getOnlineUsers);
router.get("/stats", authorizeRoles("superadmin"), getMonitorStats);

module.exports = router;
