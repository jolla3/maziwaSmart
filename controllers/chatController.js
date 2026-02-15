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

    // seller & superadmin live in User collection
    case "seller":
    case "superadmin":
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

function getDisplayName(user) {
  return user.email || user.username || user.fullname || user.name || "Unknown User";
}

// In sendMessage
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
    let receiver = await User.findById(receiverId).select("role").lean();
    let receiverType = "User";

    if (!receiver) {
      receiver = await Farmer.findById(receiverId)
        .select("farmer_code fullname")
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
      listing: listingId || null,
      message: message.trim(),
      deliveredAt: new Date(),
    });

    /* ---- notification (prevent duplicates) ---- */
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);  // 1 hour ago
    let notifMsg = `💬 New message from ${getDisplayName(req.user)}`;

    if (listingId) {
      const listing = await Listing.findById(listingId)
        .select("title price")
        .lean();

      if (listing) {
        notifMsg += ` about "${listing.title}" (Ksh ${listing.price})`;
      }
    }

    // Check for exact duplicate message within the last hour
    const existingNotif = await Notification.findOne({
      "user.id": receiverId,
      "user.type": receiverType,
      type: "chat_message",
      message: notifMsg,  // Check for identical message
      created_at: { $gte: oneHourAgo },
    });

    if (!existingNotif) {
      await Notification.create({
        user: {
          id: receiverId,
          type: receiverType,
        },
        farmer_code: receiverType === "Farmer" ? receiver.farmer_code : senderType === "Farmer" ? req.user.farmer_code : null,
        type: "chat_message",
        title: "New",  // Set title to "New"
        message: notifMsg,  // Full message with email
        created_at: new Date().toISOString(),  // UTC timestamp to avoid timezone issues
      });
    }

    /* ---- socket ---- */
    const io = req.app.get("io");
    if (io) {
      io.to(`${receiverType.toLowerCase()}_${receiverId}`)
        .emit("new_message", chatMessage);
    }

    res.status(201).json({ success: true, message: chatMessage });
  } catch (err) {
    console.error("❌ Chat send error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send message",
    });
  }
};/* ---------------- GET CONVERSATION ---------------- */

exports.getConversation = async (req, res) => {
  try {
    const counterpartId = req.params.id;
    const { listingId, cursor } = req.query;
    const currentUserId = req.user.id || req.user._id;

    const filter = {
      $or: [
        { "sender.id": currentUserId, "receiver.id": counterpartId },
        { "sender.id": counterpartId, "receiver.id": currentUserId },
      ],
    };

    if (listingId) {
      filter.listing = listingId;
    }

    // Cursor = fetch older messages only
    if (cursor) {
      filter.created_at = { $lt: new Date(cursor) };
    }

    /**
     * IMPORTANT:
     * - NO LIMIT
     * - chronological order
     * - frontend decides how much to render
     */
    const messagesRaw = await ChatMessage.find(filter)
      .sort({ created_at: 1 })
      .populate("listing", "title price")
      .lean();

    // Mark unread as read
    await ChatMessage.updateMany(
      {
        "receiver.id": currentUserId,
        "sender.id": counterpartId,
        isRead: false,
      },
      { $set: { isRead: true, readAt: new Date() } }
    );

    const messages = messagesRaw.map((m) =>
      normalizeMessage(m, currentUserId)
    );

    const nextCursor =
      messagesRaw.length > 0
        ? messagesRaw[0].created_at // oldest message returned
        : null;

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
            phone: counterpart.phone || null, // untouched, raw
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
    const userIdObj = new mongoose.Types.ObjectId(userId);

    const messages = await ChatMessage.aggregate([
      {
        $match: {
          $or: [{ "sender.id": userIdObj }, { "receiver.id": userIdObj }],
        },
      },
      { $sort: { created_at: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender.id", userIdObj] },
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
    console.error("❌ Recent chats error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load recent chat list",
    });
  }
};