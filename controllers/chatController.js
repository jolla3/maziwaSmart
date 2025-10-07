
// Utility: mask phone number (show last 2 digits only)
const mongoose = require("mongoose");
const { User, Farmer, ChatMessage, Listing, Notification } = require("../models/model");

function maskPhone(phone) {
  if (!phone) return null;
  return phone.toString().replace(/\d(?=\d{2})/g, "*");
}

function maskEmail(email) {
  if (!email) return null;
  const [name, domain] = email.split("@");
  return name[0] + "***@" + domain;
}

function getDisplayName(user) {
  return user.username || user.fullname || user.name || "Unknown User";
}


exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, message, listingId } = req.body;
    const senderId = req.user.id;
    const senderRole = req.user.role;

    // 🔹 Validate
    if (!receiverId || !message) {
      return res.status(400).json({
        success: false,
        message: "Receiver ID and message are required",
      });
    }

    // 🔹 Sender type from token
    const senderType = senderRole === "farmer" ? "Farmer" : "User";

    // 🔹 Find receiver in both collections
    let receiver = null;
    let receiverType = "User";

    receiver = await User.findById(receiverId).select("role").lean();
    if (!receiver) {
      receiver = await Farmer.findById(receiverId).select("farmer_code fullname").lean();
      if (receiver) receiverType = "Farmer";
    }

    if (!receiver) {
      return res.status(404).json({ success: false, message: "Receiver not found" });
    }

    // 🔹 Create chat message
    const chatMessage = await ChatMessage.create({
      sender: { id: senderId, type: senderType },
      receiver: { id: receiverId, type: receiverType },
      listing: listingId || null,
      message,
      deliveredAt: new Date(),
    });

    // 🔹 Build notification message
    let notifMsg = `💬 New message from ${getDisplayName(req.user)}`;
    if (listingId) {
      const listing = await Listing.findById(listingId).select("title price").lean();
      if (listing) {
        notifMsg += ` about "${listing.title}" (Ksh ${listing.price})`;
      } else {
        notifMsg += " about a listing";
      }
    }

    // 🔹 Create notification
    await Notification.create({
      user: receiverType === "User" ? receiverId : null,
      farmer: receiverType === "Farmer" ? receiverId : null,
      farmer_code:
        receiverType === "Farmer"
          ? receiver.farmer_code
          : senderRole === "farmer"
          ? req.user.farmer_code
          : null,
      type: "chat_message",
      message: notifMsg,
    });

    // 🔹 Emit real-time message
    const io = req.app.get("io");
    if (io) {
      const room =
        receiverType === "Farmer"
          ? `farmer_${receiverId}`
          : `user_${receiverId}`;
      io.to(room.toString()).emit("new_message", chatMessage);
    }

    res.status(201).json({ success: true, chatMessage });
  } catch (err) {
    console.error("❌ Chat send error:", err);
    res.status(500).json({ success: false, message: "Failed to send message" });
  }
};


// ---------------------------
// Get conversation (optionally filtered by listingId)
// ---------------------------

exports.getConversation = async (req, res) => {
  try {
    const counterpartId = req.params.id;
    const { listingId } = req.query;
    
    // ✅ Get current user from JWT token (set by auth middleware)
    const currentUserId = req.user.id || req.user._id;
    const currentUserType = req.user.role === "farmer" ? "Farmer" : "User";

    // ✅ Validate that we have a user ID
    if (!currentUserId) {
      return res.status(401).json({ 
        success: false, 
        message: "Authentication required" 
      });
    }

    const filter = {
      $or: [
        {
          "sender.id": currentUserId,
          "receiver.id": counterpartId,
        },
        {
          "sender.id": counterpartId,
          "receiver.id": currentUserId,
        },
      ],
    };
    
    if (listingId) filter.listing = listingId;

    const messages = await ChatMessage.find(filter)
      .sort({ created_at: 1 })
      .populate("listing", "title price location status")
      .lean();

    // Mark messages as read
    await ChatMessage.updateMany(
      { 
        "receiver.id": currentUserId, 
        "sender.id": counterpartId, 
        isRead: false 
      },
      { $set: { isRead: true, readAt: new Date() } }
    );

    // Fetch counterpart info
    let counterpart =
      (await Farmer.findById(counterpartId).lean()) ||
      (await User.findById(counterpartId).lean());

    const chatHistory = messages.map((m) => ({
      id: m._id,
      from: m.sender.id.toString() === currentUserId.toString() ? "me" : "them",
      text: m.message,
      isRead: m.isRead,
      createdAt: m.created_at,
    }));

    res.json({
      success: true,
      me: currentUserId.toString(),
      counterpart: counterpart
        ? {
            displayName: counterpart.username || counterpart.fullname,
            phone: counterpart.phone || null,
            email: counterpart.email || null,
          }
        : null,
      messages: chatHistory,
    });
  } catch (err) {
    console.error("❌ Chat fetch error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch conversation" 
    });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const count = await ChatMessage.countDocuments({
      "receiver.id": req.user.id,
      isRead: false,
    });
    res.json({ success: true, unread: count });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to fetch unread count" });
  }
};

exports.getRecentChats = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // 🔹 Find all messages where this user was involved
    const messages = await ChatMessage.aggregate([
      {
        $match: {
          $or: [
            { "sender.id": userId },
            { "receiver.id": userId }
          ],
        },
      },
      { $sort: { created_at: -1 } },
      {
        // ✅ Extract only the other participant's ID
        $addFields: {
          otherUserId: {
            $cond: [
              { $eq: ["$sender.id", userId] },
              "$receiver.id",
              "$sender.id"
            ]
          }
        }
      },
      {
        // ✅ Group by that user — get the last message
        $group: {
          _id: "$otherUserId",
          lastMessage: { $first: "$message" },
          createdAt: { $first: "$created_at" }
        }
      },
      { $sort: { createdAt: -1 } },
      { $limit: 30 }
    ]);

    if (!messages.length) {
      return res.json({ success: true, recent: [] });
    }

    // 🔹 Enrich with user/farmer info
    const enriched = await Promise.all(
      messages.map(async (m) => {
        const uid = m._id;

        let participant =
          (await Farmer.findById(uid)
            .select("fullname farmer_code")
            .lean()) ||
          (await User.findById(uid)
            .select("fullname username role")
            .lean());

        if (!participant) {
          return null; // skip invalid references
        }

        return {
          _id: uid,
          name: participant.fullname || participant.username || "Unknown",
          role: participant.role || (participant.farmer_code ? "Farmer" : "User"),
          farmer_code: participant.farmer_code || null,
          lastMessage: m.lastMessage,
          lastActive: m.createdAt,
        };
      })
    );

    // Filter out nulls
    const cleaned = enriched.filter(Boolean);

    res.json({ success: true, recent: cleaned });
  } catch (err) {
    console.error("❌ Recent chats error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load recent chat list",
    });
  }
};
