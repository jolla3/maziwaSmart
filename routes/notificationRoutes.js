// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
// GET notifications (with filters)
router.get('/',verifyToken, notificationController.getNotifications);

// Mark single notification as read
router.put('/read/:id',verifyToken, notificationController.markAsRead);

// Mark all notifications as read for a farmer
router.put('/mark-all',verifyToken, notificationController.markAllAsRead);

// Delete notification
router.delete('/:id',verifyToken, notificationController.deleteNotification);

module.exports = router;
