// controllers/chatController.js
const mongoose = require("mongoose");
const { User, Farmer, Porter, ChatMessage, Listing, Notification } = require("../models/model");

/* ---------------- HELPERS ---------------- */

function resolveChatType(role) {
  if (!role) return "User";
  switch (role?.toLowerCase()) {
    case "farmer": return "Farmer";
    case "porter": return "Porter";
    default: return "User";
  }
}

function normalizeMessage(doc, currentUserId) {
  const senderId = doc.sender?.id?.toString() || doc.sender?.toString();
  const receiverId = doc.receiver?.id?.toString() || doc.receiver?.toString();
  
  return {
    id: doc._id,
    _id: doc._id,
    from: senderId === currentUserId.toString() ? "me" : "them",
    senderId: senderId,
    receiverId: receiverId,
    text: doc.message,
    message: doc.message,
    isRead: doc.isRead || false,
    createdAt: doc.created_at || doc.createdAt,
    created_at: doc.created_at || doc.createdAt,
    listing: doc.listing ? {
      _id: doc.listing._id,
      title: doc.listing.title,
      price: doc.listing.price,
      images: doc.listing.images
    } : null,
  };
}

function getDisplayName(user) {
  return user?.email || user?.username || user?.fullname || user?.name || "Unknown User";
}

async function findUserById(userId) {
  let user = await User.findById(userId).select("username email fullname phone role").lean();
  if (user) return { user, collection: "User" };

  user = await Farmer.findById(userId).select("fullname email phone role").lean();
  if (user) return { user, collection: "Farmer" };

  user = await Porter.findById(userId).select("fullname email phone role").lean();
  if (user) return { user, collection: "Porter" };

  return null;
}

async function getCounterpartInfo(userId) {
  const result = await findUserById(userId);
  if (!result) return null;
  
  const { user } = result;
  return {
    _id: user._id,
    id: user._id,
    fullname: user.fullname || user.username || user.name,
    name: user.fullname || user.username || user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
}

/* ---------------- GET MESSAGES ---------------- */
// controllers/chatController.js - Update getMessages
exports.getMessages = async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const currentUserId = req.user.id || req.user._id;

    // ✅ VALIDATE: Must be a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const otherUserResult = await findUserById(otherUserId);
    if (!otherUserResult) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const messages = await ChatMessage.find({
      $or: [
        { "sender.id": currentUserId, "receiver.id": otherUserId },
        { "sender.id": otherUserId, "receiver.id": currentUserId },
      ],
    })
      .sort({ created_at: 1 })
      .populate("listing", "title price images")
      .lean();

    // Mark as read
    await ChatMessage.updateMany(
      {
        "sender.id": otherUserId,
        "receiver.id": currentUserId,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    const normalizedMessages = messages.map((msg) => normalizeMessage(msg, currentUserId));
    const counterpart = await getCounterpartInfo(otherUserId);

    // Get online status
    const onlineUsers = req.app.get("onlineUsers") || new Map();
    const userStatus = onlineUsers.get(otherUserId.toString());

    res.json({
      success: true,
      messages: normalizedMessages,
      counterpart: {
        ...counterpart,
        isOnline: !!userStatus,
        lastSeen: userStatus?.connectedAt || null,
      },
    });
  } catch (err) {
    console.error("❌ Get messages error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
    });
  }
};
/* ---------------- SEND MESSAGE ---------------- */

exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, message, listingId } = req.body;
    const senderId = req.user.id 

    if (!receiverId || !message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Receiver and non-empty message are required",
      });
    }

    if (senderId.toString() === receiverId.toString()) {
      return res.status(400).json({
        success: false,
        message: "Cannot message yourself",
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Message too long (max 2000 characters)",
      });
    }

    const senderType = resolveChatType(req.user.role);
    const receiverResult = await findUserById(receiverId);
    
    if (!receiverResult) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found",
      });
    }

    const { user: receiver } = receiverResult;
    const receiverType = resolveChatType(receiver.role);

    // Create message
    const chatMessage = await ChatMessage.create({
      sender: { id: senderId, type: senderType },
      receiver: { id: receiverId, type: receiverType },
      listing: listingId || null,
      message: message.trim(),
      created_at: new Date(),
      deliveredAt: new Date(),
    });

    // Populate listing if exists
    if (chatMessage.listing) {
      await chatMessage.populate("listing", "title price images");
    }

    // Create notification
    const senderName = getDisplayName(req.user);
    let notifMsg = `💬 New message from ${senderName}`;

    if (listingId) {
      const listing = await Listing.findById(listingId).select("title price").lean();
      if (listing) {
        notifMsg += ` about "${listing.title}" (Ksh ${listing.price})`;
      }
    }

    // Avoid duplicate notifications
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const existingNotif = await Notification.findOne({
      "user.id": receiverId,
      "user.type": receiverType,
      type: "chat_message",
      message: notifMsg,
      created_at: { $gte: oneHourAgo },
    });

    if (!existingNotif) {
      await Notification.create({
        user: { id: receiverId, type: receiverType },
        type: "chat_message",
        title: "New Message",
        message: notifMsg,
        created_at: new Date(),
      });
    }

    // Emit to receiver via Socket.IO
    const io = req.app.get("io");
    if (io) {
      const normalizedMsg = normalizeMessage(chatMessage, senderId);
      
      // Send to receiver
      io.to(receiverId.toString()).emit("new_message", normalizedMsg);
      
      // Confirm to sender
      io.to(senderId.toString()).emit("message_sent", normalizedMsg);
    }

    res.status(201).json({ 
      success: true, 
      message: normalizeMessage(chatMessage, senderId) 
    });
  } catch (err) {
    console.error("❌ Chat send error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send message",
    });
  }
};

/* ---------------- GET CONVERSATION LIST ---------------- */

// controllers/chatController.js - Update getConversationList
exports.getConversationList = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const conversations = await ChatMessage.aggregate([
      {
        $match: {
          $or: [
            { "sender.id": new mongoose.Types.ObjectId(userId) },
            { "receiver.id": new mongoose.Types.ObjectId(userId) },
          ],
        },
      },
      {
        $sort: { created_at: -1 },
      },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: ["$sender.id", new mongoose.Types.ObjectId(userId)] },
              then: "$receiver.id",
              else: "$sender.id",
            },
          },
          lastMessage: { $last: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: {
                if: {
                  $and: [
                    { $eq: ["$receiver.id", new mongoose.Types.ObjectId(userId)] },
                    { $eq: ["$isRead", false] },
                  ],
                },
                then: 1,
                else: 0,
              },
            },
          },
        },
      },
      {
        $sort: { "lastMessage.created_at": -1 },
      },
    ]);

    const onlineUsers = req.app.get("onlineUsers") || new Map();
    
    const conversationList = await Promise.all(
      conversations.map(async (conv) => {
        const otherUserId = conv._id;
        const counterpart = await getCounterpartInfo(otherUserId);
        
        if (!counterpart) return null;

        const userStatus = onlineUsers.get(otherUserId.toString());
        
        return {
          id: otherUserId,
          _id: otherUserId,
          name: counterpart.fullname || counterpart.name || "Unknown",
          fullname: counterpart.fullname || counterpart.name || "Unknown",
          email: counterpart.email,
          phone: counterpart.phone,
          role: counterpart.role,
          isOnline: !!userStatus,
          lastMessage: conv.lastMessage?.message || "",
          lastAt: conv.lastMessage?.created_at || conv.lastMessage?.createdAt,
          unreadCount: conv.unreadCount,
        };
      })
    );

    const filteredList = conversationList
      .filter(c => c !== null)
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

    // ✅ FIX: Return as "recent" to match frontend
    res.json({
      success: true,
      recent: filteredList,  // Changed from "conversations" to "recent"
    });
  } catch (err) {
    console.error("❌ Get conversation list error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch conversations",
    });
  }
};
/* ---------------- MARK AS READ ---------------- */

exports.markAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id || req.user._id;

    const message = await ChatMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    if (message.receiver.id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    message.isRead = true;
    message.readAt = new Date();
    await message.save();

    // Notify sender
    const io = req.app.get("io");
    if (io) {
      io.to(message.sender.id.toString()).emit("message_read", {
        messageId: message._id,
        readBy: userId,
      });
    }

    res.json({ success: true, message });
  } catch (err) {
    console.error("❌ Mark as read error:", err);
    res.status(500).json({ success: false, message: "Failed to mark as read" });
  }
};

/* ---------------- DELETE MESSAGE ---------------- */

exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id || req.user._id;

    const message = await ChatMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Only sender can delete
    if (message.sender.id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this message",
      });
    }

    await ChatMessage.findByIdAndDelete(messageId);

    // Notify receiver
    const io = req.app.get("io");
    if (io) {
      io.to(message.receiver.id.toString()).emit("message_deleted", {
        messageId,
      });
    }

    res.json({ success: true, message: "Message deleted" });
  } catch (err) {
    console.error("❌ Delete message error:", err);
    res.status(500).json({ success: false, message: "Failed to delete message" });
  }
};