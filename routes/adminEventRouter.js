const router = require("express").Router();
const { authorizeRoles, verifyToken } = require("../middleware/authMiddleware");
const { getEvents, getEventById } = require("../controllers/adminEventController");

router.get("/",verifyToken, authorizeRoles("superadmin"), getEvents);
router.get("/:id", verifyToken,authorizeRoles("superadmin"), getEventById);

module.exports = router;
