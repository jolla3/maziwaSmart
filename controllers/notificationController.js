// controllers/notificationController.js
const { Notification } = require("../models/model");

// 🛠 Helper: decide filter based on logged-in role
function buildUserFilter(req) {
  if (req.user.role === "farmer") {
    return { farmer: req.user.id };
  } else {
    return { user: req.user.id };
  }
}

// 🟢 Get all notifications (filter by role, farmer_code, user)
// controllers/notificationController.js

exports.getNotifications = async (req, res) => {
  try {
    const { type, is_read } = req.query;

    let filter = {};

    if (req.user.role === "farmer") {
      // ✅ Farmers: support BOTH farmer (ObjectId) and farmer_code (legacy)
      filter.$and = [
        {
          $or: [
            { farmer: req.user.id },
            { farmer_code: req.user.code }
          ]
        }
      ];
    } else {
      // ✅ Non-farmers (buyers, sellers, admins)
      filter.user = req.user.id;
    }

    // ✅ Add optional filters
    if (type) {
      filter.$and = filter.$and || [];
      filter.$and.push({ type });
    }

    if (is_read !== undefined) {
      filter.$and = filter.$and || [];
      filter.$and.push({ is_read: is_read === "true" });
    }

    const notifications = await Notification.find(filter)
      .populate("cow", "cow_name animal_code")
      .sort({ created_at: -1 });

    res.json({
      success: true,
      count: notifications.length,
      data: notifications,
    });
  } catch (err) {
    console.error("❌ Error fetching notifications:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};


// 🟢 Create a notification + emit to socket

// 🟢 Mark a single notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const filter = buildUserFilter(req);

    const updated = await Notification.findOneAndUpdate(
      { _id: id, ...filter },
      { is_read: true },
      { new: true }
    );

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    const io = req.app.get("io");
    if (updated.user) io.to(`user_${updated.user}`).emit("notification_read", updated);
    if (updated.farmer)
      io.to(`farmer_${updated.farmer}`).emit("notification_read", updated);

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error("❌ Error marking as read:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 🟢 Mark all as read for current user
exports.markAllAsRead = async (req, res) => {
  try {
    const filter = buildUserFilter(req);

    await Notification.updateMany(filter, { is_read: true });

    const io = req.app.get("io");
    if (filter.user)
      io.to(`user_${filter.user}`).emit("all_notifications_read", filter);
    if (filter.farmer)
      io.to(`farmer_${filter.farmer}`).emit("all_notifications_read", filter);

    res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    console.error("❌ Error marking all as read:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// 🟢 Delete a notification
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const filter = buildUserFilter(req);

    const deleted = await Notification.findOneAndDelete({ _id: id, ...filter });
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    }

    const io = req.app.get("io");
    if (deleted.user)
      io.to(`user_${deleted.user}`).emit("notification_deleted", { id });
    if (deleted.farmer)
      io.to(`farmer_${deleted.farmer}`).emit("notification_deleted", { id });

    res.json({ success: true, message: "Notification deleted" });
  } catch (err) {
    console.error("❌ Error deleting notification:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
exports.createNotification = async (req, res) => {
  try {
    const { type, message, cow, targetUserId, targetFarmerId } = req.body;

    const notification = await Notification.create({
      user: targetUserId || null,
      farmer: targetFarmerId || null,
      cow: cow || null,
      type,
      message,
    });

    const io = req.app.get("io");
    if (targetUserId) {
      io.to(`user_${targetUserId}`).emit("new_notification", notification);
    }
    if (targetFarmerId) {
      io.to(`farmer_${targetFarmerId}`).emit("new_notification", notification);
    }

    res.status(201).json({ success: true, data: notification });
  } catch (err) {
    console.error("❌ Error creating notification:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
