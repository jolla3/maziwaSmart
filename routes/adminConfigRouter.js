const router = require("express").Router();
const { authorizeRoles } = require("../middleware/authMiddleware");
const { getConfig, updateConfig } = require("../controllers/adminConfigController");

router.get("/", authorizeRoles("superadmin"), getConfig);
router.patch("/", authorizeRoles, updateConfig);

module.exports = router;
