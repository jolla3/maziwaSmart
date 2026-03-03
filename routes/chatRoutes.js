// routes/chatRoutes.js
const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { verifyToken } = require("../middleware/authMiddleware");

router.use(verifyToken)

// ✅ MUST BE FIRST - More specific routes
router.get("/", chatController.getConversationList);  // GET /api/chat

// ✅ SECOND - Dynamic parameter
router.get("/:otherUserId", chatController.getMessages);  // GET /api/chat/:userId

// Send message
router.post("/", chatController.sendMessage);

// Mark as read
router.patch("/read/:messageId", chatController.markAsRead);

// Delete message  
router.delete("/:messageId", chatController.deleteMessage);

module.exports = router;

