// utils/notificationService.js
const { Notification } = require('../models/model');

/**
 * Create a new notification
 * @param {Object} options
 * @param {String} options.farmer_code - Farmer's unique code
 * @param {String} options.type - Notification type (e.g., "milk_anomaly", "calving", "gestation_alert")
 * @param {String} options.message - Notification message
 * @param {ObjectId} [options.cow] - Related cow _id
 * @param {Boolean} [options.is_read=false] - Whether notification is read
 */
exports.createNotification = async ({
  farmer_code,
  type,
  message,
  cow = null,
  is_read = false
}) => {
  try {
    const notification = new Notification({
      farmer_code,
      type,
      message,
      cow,
      is_read
    });

    await notification.save();
    return notification;
  } catch (err) {
    console.error("❌ Failed to create notification:", err.message);
    throw err;
  }
};
