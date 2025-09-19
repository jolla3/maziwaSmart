// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
// GET notifications (with filters)
router.get('/',verifyToken,authorizeRoles('farmer'), notificationController.getNotifications);

// Mark single notification as read
router.put('/:id/read',verifyToken,authorizeRoles('farmer'), notificationController.markAsRead);

// Mark all notifications as read for a farmer
router.put('/mark-all',verifyToken,authorizeRoles('farmer'), notificationController.markAllAsRead);

// Delete notification
router.delete('/:id',verifyToken,authorizeRoles('farmer'), notificationController.deleteNotification);

module.exports = router;
