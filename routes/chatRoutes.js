const express = require('express');
const router = express.Router();
const { sendMessage, getConversation } = require('../controllers/chatController');
const { verifyToken } = require('../middleware/authMiddleware');

// Send a message (global or about a listing)
router.post('/', verifyToken, sendMessage);

// Get conversation (optionally tied to a listing)
router.get('/:userId', verifyToken, getConversation);

module.exports = router;
