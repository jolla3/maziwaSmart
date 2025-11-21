const router = require("express").Router();
const { getOnlineUsers, getMonitorStats } = require("../controllers/adminMonitorController");
const { verifyToken,authorizeRoles } = require("../middleware/authMiddleware");

router.get("/online-users",verifyToken, authorizeRoles("superadmin"), getOnlineUsers);
router.get("/stats",verifyToken, authorizeRoles("superadmin"), getMonitorStats);

module.exports = router;
