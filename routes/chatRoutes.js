// routes/chatRoutes.js
const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { verifyToken } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(verifyToken);

// Get conversation list
router.get("/", chatController.getConversationList);

// Get messages with a specific user
router.get("/:otherUserId", chatController.getMessages);

// Send a message
router.post("/", chatController.sendMessage);

// Mark message as read
router.patch("/read/:messageId", chatController.markAsRead);

// Delete a message
router.delete("/:messageId", chatController.deleteMessage);

module.exports = router;