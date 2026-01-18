const mongoose = require("mongoose");
const { User, Farmer, ChatMessage, Listing, Notification } = require("../models/model");

/* ---------------- HELPERS ---------------- */

function getDisplayName(user = {}) {
  return (
    user.name ||
    user.username ||
    user.fullname ||
    user.email ||
    "Unknown User"
  );
}

/**
 * MUST match ChatMessage enum exactly
 * enum: ["User", "Farmer", "Porter", "seller", "superadmin"]
 */
function resolveChatType(role) {
  if (!role) return "User";
  switch (role.toLowerCase()) {
    case "farmer":
      return "Farmer";
    case "porter":
      return "Porter";
    case "seller":
      return "seller";
    case "superadmin":
      return "superadmin";
    default:
      return "User";
  }
}

/**
 * Normalize ChatMessage → API DTO
 */
function normalizeMessage(doc, currentUserId) {
  return {
    id: doc._id,
    from:
      doc.sender.id.toString() === currentUserId.toString()
        ? "me"
        : "them",
    text: doc.message,
    isRead: doc.isRead,
    createdAt: doc.created_at,
    listing: doc.listing
      ? {
          title: doc.listing.title,
          price: doc.listing.price,
        }
      : null,
  };
}

/* ---------------- SEND MESSAGE ---------------- */

exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, message, listingId } = req.body;
    const senderId = req.user.id || req.user._id;

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
        message: "Message too long",
      });
    }

    const senderType = resolveChatType(req.user.role);

    /* ---- resolve receiver ---- */
    let receiver =
      (await User.findById(receiverId).select("role").lean()) ||
      (await Farmer.findById(receiverId)
        .select("role farmer_code fullname")
        .lean());

    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found",
      });
    }

    const receiverType = resolveChatType(receiver.role || "farmer");

    /* ---- persist message ---- */
    const chatMessage = await ChatMessage.create({
      sender: { id: senderId, type: senderType },
      receiver: { id: receiverId, type: receiverType },
      listing: listingId || null,
      message: message.trim(),
      deliveredAt: new Date(),
    });

    await chatMessage.populate("listing", "title price");

    /* ---- notification ---- */
    let notifMsg = `💬 New message from ${getDisplayName(req.user)}`;

    if (listingId && chatMessage.listing) {
      notifMsg += ` about "${chatMessage.listing.title}" (Ksh ${chatMessage.listing.price})`;
    }

    await Notification.create({
      user: {
        id: receiverId,
        type: receiverType,
      },
      farmer_code:
        receiverType === "Farmer"
          ? receiver.farmer_code
          : senderType === "Farmer"
          ? req.user.farmer_code
          : null,
      type: "chat_message",
      message: notifMsg,
    });

    /* ---- normalize once ---- */
    const normalized = normalizeMessage(chatMessage, senderId);

    /* ---- socket ---- */
    const io = req.app.get("io");
    if (io) {
      io.to(`${receiverType.toLowerCase()}_${receiverId}`).emit(
        "new_message",
        normalized
      );
    }

    res.status(201).json({ success: true, message: normalized });
  } catch (err) {
    console.error("❌ Chat send error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send message",
    });
  }
};

/* ---------------- GET CONVERSATION (CURSOR PAGINATION) ---------------- */

exports.getConversation = async (req, res) => {
  try {
    const counterpartId = req.params.id;
    const { listingId, cursor, limit = 30 } = req.query;
    const currentUserId = req.user.id || req.user._id;

    const filter = {
      $or: [
        { "sender.id": currentUserId, "receiver.id": counterpartId },
        { "sender.id": counterpartId, "receiver.id": currentUserId },
      ],
    };

    if (listingId) filter.listing = listingId;

    if (cursor) {
      filter.created_at = { $lt: new Date(cursor) };
    }

    const docs = await ChatMessage.find(filter)
      .sort({ created_at: -1 })
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

    const messages = docs
      .reverse()
      .map((m) => normalizeMessage(m, currentUserId));

    const nextCursor =
      docs.length > 0 ? docs[docs.length - 1].created_at : null;

    const counterpart =
      (await Farmer.findById(counterpartId).lean()) ||
      (await User.findById(counterpartId).lean());

    res.json({
      success: true,
      messages,
      nextCursor,
      counterpart: counterpart
        ? {
            displayName:
              counterpart.username ||
              counterpart.fullname ||
              counterpart.name,
            phone: counterpart.phone || null, // ✅ UNMASKED
            email: counterpart.email || null,
            location:
              counterpart.location ||
              counterpart.location_description ||
              null,
          }
        : null,
    });
  } catch (err) {
    console.error("❌ Chat fetch error:", err);
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

    const count = await ChatMessage.countDocuments({
      "receiver.id": currentUserId,
      isRead: false,
    });

    res.json({ success: true, unread: count });
  } catch (err) {
    console.error("❌ Unread count error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch unread count",
    });
  }
};

/* ---------------- RECENT CHATS ---------------- */

exports.getRecentChats = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

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

    res.json({ success: true, recent: messages });
  } catch (err) {
    console.error("❌ Recent chats error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load recent chat list",
    });
  }
};
