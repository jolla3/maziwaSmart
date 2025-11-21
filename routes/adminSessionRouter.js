const router = require("express").Router();
const {verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const { getSessions, killSession } = require("../controllers/adminSessionController");

router.get("/",verifyToken, authorizeRoles("superadmin"), getSessions);
router.delete("/:id",verifyToken, authorizeRoles("superadmin"), killSession);

module.exports = router;
