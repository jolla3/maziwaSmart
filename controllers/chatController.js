const mongoose = require("mongoose");
const { User, Farmer, ChatMessage, Listing, Notification } = require("../models/model");

/* ---------------- HELPERS ---------------- */

function getDisplayName(user = {}) {
  return user.name || user.fullname || user.username || user.email || "Unknown User";
}

/**
 * MUST match ChatMessage enum exactly
 * enum: ["User", "Farmer", "seller", "superadmin"]
 */
function resolveChatType(role) {
  if (!role) return "User";
  switch (role.toLowerCase()) {
    case "farmer":
      return "Farmer";
    case "seller":
      return "seller";
    case "superadmin":
      return "superadmin";
    default:
      return "User";
  }
}

/* ---------------- SEND MESSAGE ---------------- */

exports.sendMessage = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { receiverId, message, listingId } = req.body;
    const senderId = req.user.id;

    if (!receiverId || !message?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Receiver and non-empty message are required",
      });
    }

    if (String(senderId) === String(receiverId)) {
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
    let receiver = await User.findById(receiverId)
      .select("role")
      .session(session)
      .lean();

    let receiverType = "User";

    if (!receiver) {
      receiver = await Farmer.findById(receiverId)
        .select("farmer_code fullname")
        .session(session)
        .lean();

      if (!receiver) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: "Receiver not found",
        });
      }

      receiverType = "Farmer";
    } else {
      receiverType = resolveChatType(receiver.role);
    }

    /* ---- create message ---- */
    const [chatMessage] = await ChatMessage.create(
      [
        {
          sender: { id: senderId, type: senderType },
          receiver: { id: receiverId, type: receiverType },
          listing: listingId || null,
          message: message.trim(),
          deliveredAt: new Date(),
        },
      ],
      { session }
    );

    /* ---- build notification text ---- */
    let notifMsg = `💬 New message from ${getDisplayName(req.user)}`;

    if (listingId) {
      const listing = await Listing.findById(listingId)
        .select("title price")
        .session(session)
        .lean();

      if (listing) {
        notifMsg += ` about "${listing.title}" (Ksh ${listing.price})`;
      }
    }

    /* ---- create notification ---- */
    await Notification.create(
      [
        {
          user: {
            id: receiverId,
            type: receiverType,
          },
          farmer_code:
            receiverType === "Farmer"
              ? receiver.farmer_code
              : senderType === "Farmer"
              ? req.user.code
              : null,
          type: "chat_message",
          message: notifMsg,
        },
      ],
      { session }
    );

    /* ---- commit ---- */
    await session.commitTransaction();
    session.endSession();

    /* ---- socket emit AFTER commit ---- */
    const io = req.app.get("io");
    if (io) {
      io.to(`${receiverType.toLowerCase()}_${receiverId}`)
        .emit("new_message", chatMessage);
    }

    res.status(201).json({ success: true, message: chatMessage });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("❌ Chat send error:", err);
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

    const filter = {
      $or: [
        { "sender.id": currentUserId, "receiver.id": counterpartId },
        { "sender.id": counterpartId, "receiver.id": currentUserId },
      ],
    };

    if (listingId) filter.listing = listingId;

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
      (await Farmer.findById(counterpartId).lean()) ||
      (await User.findById(counterpartId).lean());

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
