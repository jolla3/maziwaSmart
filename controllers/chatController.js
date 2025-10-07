const { ChatMessage, Farmer, User, Notification, Listing } = require('../models/model');

// Utility: mask phone number (show last 2 digits only)
function maskPhone(phone) {
  if (!phone) return null;
  return phone.toString().replace(/\d(?=\d{2})/g, "*");
}

// Utility: mask email
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
    const { receiverId, receiverType, message, listingId } = req.body;
    const senderId = req.user.id;
    const senderType = req.user.role === "farmer" ? "Farmer" : "User";

    if (!receiverId || !receiverType || !message) {
      return res.status(400).json({ success: false, message: "Receiver info and message are required" });
    }

    const chatMessage = await ChatMessage.create({
      sender: { id: senderId, type: senderType },
      receiver: { id: receiverId, type: receiverType },
      listing: listingId || null,
      message,
      deliveredAt: new Date(),
    });

    // Notification text
    let notifMsg = `💬 New message from ${getDisplayName(req.user)}`;
    if (listingId) {
      const listing = await Listing.findById(listingId).select("title price").lean();
      if (listing) {
        notifMsg += ` about "${listing.title}" (Ksh ${listing.price})`;
      } else {
        notifMsg += " about a listing"; // fallback
      }
    }
    await Notification.create({
      user: receiverId,
      type: "chat_message",
      message: notifMsg,
    });

    const io = req.app.get("io");
if (io) {
  io.to(receiver.toString()).emit("new_message", chatMessage);
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
