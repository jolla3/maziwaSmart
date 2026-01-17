const mongoose = require("mongoose");
const { User, Farmer, ChatMessage, Listing, Notification } = require("../models/model");
/* ---------------- HELPERS ---------------- */
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
/**
 * MUST match ChatMessage enum exactly
 * enum: ["User", "Farmer", "Porter"]
 */
function resolveChatType(role) {
  if (!role) return "User";
  switch (role.toLowerCase()) {
    case "farmer":
      return "Farmer";
    case "porter":
      return "Porter";
    default:
      return "User";
  }
}
/* ---------------- SEND MESSAGE ---------------- */
exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, message, listingId } = req.body;
    const senderId = req.user.id || req.user._id;
    if (!mongoose.Types.ObjectId.isValid(senderId)) {
      return res.status(400).json({ success: false, message: "Invalid sender ID" });
    }
    if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ success: false, message: "Invalid receiver ID" });
    }
    if (!message || !message.trim()) {
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
        message: "Message too long",
      });
    }
    const senderType = resolveChatType(req.user.role);
    /* ---- resolve receiver ---- */
    let receiver = await User.findById(receiverId).select("role username fullname phone email").lean();
    let receiverType = "User";
    if (!receiver) {
      receiver = await Farmer.findById(receiverId)
        .select("farmer_code fullname phone email")
        .lean();
      if (!receiver) {
        return res.status(404).json({
          success: false,
          message: "Receiver not found",
        });
      }
      receiverType = "Farmer";
    } else {
      receiverType = resolveChatType(receiver.role);
    }
    /* ---- persist message ---- */
    const chatMessage = await ChatMessage.create({
      sender: { id: senderId, type: senderType },
      receiver: { id: receiverId, type: receiverType },
      listing: listingId && mongoose.Types.ObjectId.isValid(listingId) ? new mongoose.Types.ObjectId(listingId) : null,
      message: message.trim(),
      deliveredAt: new Date(),
    });
    /* ---- notification ---- */
    let notifMsg = `💬 New message from ${getDisplayName(req.user)}`;
    if (listingId) {
      const listing = await Listing.findById(listingId)
        .select("title price")
        .lean();
      if (listing) {
        notifMsg += ` about "${listing.title}" (Ksh ${listing.price})`;
      }
    }
    await Notification.create({
      user: receiverType === "User" ? receiverId : null,
      farmer: receiverType === "Farmer" ? receiverId : null,
      farmer_code:
        receiverType === "Farmer"
          ? receiver.farmer_code
          : senderType === "Farmer"
          ? req.user.farmer_code
          : null,
      type: "chat_message",
      message: notifMsg,
    });
    /* ---- socket ---- */
    const io = req.app.get("io");
    if (io) {
      io.to(`${receiverType.toLowerCase()}_${receiverId}`)
        .emit("new_message", chatMessage);
    }
    res.status(201).json({ success: true, message: chatMessage });
  } catch (err) {
    console.error("❌ Chat send error:", err.message, err.stack);
    res.status(500).json({
      success: false,
      message: "Failed to send message",
    });
  }
};
/* ---------------- GET CONVERSATION ---------------- */
exports.getConversation = async (req, res) => {
  try {
    const counterpartId = req.params.id;
    const { listingId, page = 1, limit = 50 } = req.query;
    const currentUserId = req.user.id || req.user._id;
    if (!mongoose.Types.ObjectId.isValid(currentUserId) || !mongoose.Types.ObjectId.isValid(counterpartId)) {
      return res.status(400).json({ success: false, message: "Invalid user IDs" });
    }
    const filter = {
      $or: [
        { "sender.id": currentUserId, "receiver.id": counterpartId },
        { "sender.id": counterpartId, "receiver.id": currentUserId },
      ],
    };
    if (listingId && mongoose.Types.ObjectId.isValid(listingId)) {
      filter.listing = new mongoose.Types.ObjectId(listingId);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const messages = await ChatMessage.find(filter)
      .sort({ created_at: 1 })
      .skip(skip)
      .limit(Number(limit))
      .populate("listing", "title price")
      .lean();
    await ChatMessage.updateMany(
      {
        "receiver.id": currentUserId,
        "sender.id": counterpartId,
        isRead: false,
      },
      { $set: { isRead: true, readAt: new Date() } }
    );
    const counterpart =
      (await Farmer.findById(counterpartId).select("fullname farmer_code phone email").lean()) ||
      (await User.findById(counterpartId).select("username fullname phone email").lean());
    if (counterpart) {
      counterpart.phone = maskPhone(counterpart.phone);
      counterpart.email = maskEmail(counterpart.email);
    }
    res.json({
      success: true,
      messages: messages.map((m) => ({
        id: m._id,
        from:
          m.sender.id.toString() === currentUserId.toString()
            ? "me"
            : "them",
        text: m.message,
        isRead: m.isRead,
        createdAt: m.created_at,
        listing: m.listing
          ? { title: m.listing.title, price: m.listing.price }
          : null,
      })),
      counterpart: counterpart
        ? {
            displayName: counterpart.username || counterpart.fullname,
            phone: counterpart.phone,
            email: counterpart.email,
          }
        : null,
      hasMore: messages.length === Number(limit),
    });
  } catch (err) {
    console.error("❌ Chat fetch error:", err.message, err.stack);
    res.status(500).json({
      success: false,
      message: "Failed to fetch conversation",
    });
  }
};
/* ---------------- UNREAD COUNT ---------------- */
exports.getUnreadCount = async (req, res) => {
  try {
    const currentUserId = req.user.id || req.user._id;
    if (!mongoose.Types.ObjectId.isValid(currentUserId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }
    const count = await ChatMessage.countDocuments({
      "receiver.id": currentUserId,
      isRead: false,
    });
    res.json({ success: true, unread: count });
  } catch (err) {
    console.error("❌ Unread count error:", err.message, err.stack);
    res.status(500).json({
      success: false,
      message: "Failed to fetch unread count",
    });
  }
};
/* ---------------- RECENT CHATS ---------------- */
exports.getRecentChats = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id || req.user._id);
    const messages = await ChatMessage.aggregate([
      {
        $match: {
          $or: [{ "sender.id": userId }, { "receiver.id": userId }],
        },
      },
      { $sort: { created_at: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender.id", userId] },
              "$receiver.id",
              "$sender.id",
            ],
          },
          lastMessage: { $first: "$message" },
          lastAt: { $first: "$created_at" },
        },
      },
      { $sort: { lastAt: -1 } },
      { $limit: 30 },
    ]);
    if (!messages.length) {
      return res.json({ success: true, recent: [] });
    }
    const enriched = await Promise.all(
      messages.map(async (m) => {
        const uid = m._id;
        let participant =
          (await Farmer.findById(uid).select("fullname farmer_code phone email").lean()) ||
          (await User.findById(uid).select("username fullname phone email").lean());
        if (!participant) return null;
        return {
          id: uid.toString(),
          name: getDisplayName(participant),
          phone: maskPhone(participant.phone),
          email: maskEmail(participant.email),
          lastMessage: m.lastMessage,
          lastAt: m.lastAt,
        };
      })
    );
    res.json({ success: true, recent: enriched.filter(Boolean) });
  } catch (err) {
    console.error("❌ Recent chats error:", err.message, err.stack);
    res.status(500).json({
      success: false,
      message: "Failed to load recent chat list",
    });
  }
};