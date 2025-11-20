const router = require("express").Router();
const { authorizeRoles } = require("../middleware/authMiddleware");
const { getSessions, killSession } = require("../controllers/adminSessionController");

router.get("/", authorizeRoles("superadmin"), getSessions);
router.delete("/:id", authorizeRoles("superadmin"), killSession);

module.exports = router;
