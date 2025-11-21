const router = require("express").Router();
const {verifyToken,authorizeRoles } = require("../middleware/authMiddleware");
const { getConfig, updateConfig } = require("../controllers/adminConfigController");

router.get("/", verifyToken,authorizeRoles("superadmin"), getConfig);
router.patch("/",verifyToken, authorizeRoles('superadmin'), updateConfig);

module.exports = router;
