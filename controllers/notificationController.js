// controllers/notificationController.js
const { Notification } = require('../models/model');

// 🟢 Get all notifications (optionally filter by farmer or type)
exports.getNotifications = async (req, res) => {
  try {
    const { farmer_code, type, is_read } = req.query;
    const filter = {};


    if (farmer_code) filter.farmer_code = farmer_code;
    if (type) filter.type = type;
    if (is_read !== undefined) filter.is_read = is_read === 'true';

    const notifications = await Notification.find(filter)
      .populate('cow', 'cow_name animal_code')
      .sort({ created_at: -1 });

    res.json({ success: true, count: notifications.length, data: notifications });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 🟢 Create a notification + emit to socket
exports.createNotification = async (req, res) => {
  try {
    const { farmer_code, type, message, role_target } = req.body;

    const notification = await Notification.create({
      farmer_code,
      type,
      message,
      role_target
    });

    const io = req.app.get('io');
    if (farmer_code) {
      io.to(`farmer_${farmer_code}`).emit('new_notification', notification);
    }
    if (role_target) {
      io.to(role_target).emit('new_notification', notification);
    }

    res.status(201).json({ success: true, data: notification });
  } catch (err) {
    console.error('Error creating notification:', err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 🟢 Mark a single notification as read + emit
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Notification.findByIdAndUpdate(
      id,
      { is_read: true },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    const io = req.app.get('io');
    if (updated.farmer_code) {
      io.to(`farmer_${updated.farmer_code}`).emit('notification_read', updated);
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 🟢 Mark all as read for a farmer + emit
exports.markAllAsRead = async (req, res) => {
  try {
    const { farmer_code } = req.body;
    await Notification.updateMany({ farmer_code, is_read: false }, { is_read: true });

    const io = req.app.get('io');
    io.to(`farmer_${farmer_code}`).emit('all_notifications_read', { farmer_code });

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// 🟢 Delete a notification + emit
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Notification.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    const io = req.app.get('io');
    if (deleted.farmer_code) {
      io.to(`farmer_${deleted.farmer_code}`).emit('notification_deleted', { id: deleted._id });
    }

    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
