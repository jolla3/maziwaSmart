const router = require("express").Router();
const { authorizeRoles, verifyToken } = require("../middleware/authMiddleware");
const { getEvents, getEventById } = require("../controllers/adminEventController");

router.get("/", authorizeRoles("superadmin"), getEvents);
router.get("/:id", authorizeRoles("superadmin"), getEventById);

module.exports = router;
