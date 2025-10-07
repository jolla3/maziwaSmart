const express = require('express');
const router = express.Router();
const {
  sendMessage,
  getConversation,
  getRecentChats, // make sure it's imported
} = require('../controllers/chatController');
const { verifyToken } = require('../middleware/authMiddleware');

// ✅ Important: place this FIRST
router.get('/recent', verifyToken, getRecentChats);

// Send message
router.post('/', verifyToken, sendMessage);

// Get conversation (by counterpart)
router.get('/:id', verifyToken, getConversation);

module.exports = router;
