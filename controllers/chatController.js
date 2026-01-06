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
    const senderId = req.user.id || req.user._id;
    const senderRole = req.user.role;

    // Validate inputs
    if (!mongoose.Types.ObjectId.isValid(senderId)) {
      return res.status(400).json({ success: false, message: "Invalid sender ID" });
    }
    if (!receiverId || !mongoose.Types.ObjectId.isValid(receiverId) || !message || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: "Valid receiver ID and non-empty message are required" });
    }
    if (listingId && !mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID" });
    }
    if (senderId.toString() === receiverId.toString()) {
      return res.status(400).json({ success: false, message: "Cannot message yourself" });
    }
    if (message.length > 2000) { // Arbitrary limit to prevent abuse
      return res.status(400).json({ success: false, message: "Message too long" });
    }

    const senderType = senderRole === "farmer" ? "farmer" : "user";

    // Find receiver
    let receiver = await User.findById(receiverId).select("role").lean();
    let receiverType = "user";
    if (!receiver) {
      receiver = await Farmer.findById(receiverId).select("farmer_code fullname").lean();
      if (receiver) receiverType = "farmer";
    }
    if (!receiver) {
      return res.status(404).json({ success: false, message: "Receiver not found" });
    }

    // Create message
    const chatMessage = await ChatMessage.create({
      sender: { id: senderId, type: senderType },
      receiver: { id: receiverId, type: receiverType },
      listing: listingId ? new mongoose.Types.ObjectId(listingId) : null,
      message: message.trim(),
      deliveredAt: new Date(),
    });

    // Build notification
    let notifMsg = `💬 New message from ${getDisplayName(req.user)}`;
    if (listingId) {
      const listing = await Listing.findById(listingId).select("title price").lean();
      if (listing) {
        notifMsg += ` about "${listing.title}" (Ksh ${listing.price})`;
      } else {
        notifMsg += " about a listing";
        // Optional: Delete message if listing invalid, but assume soft delete
      }
    }

    await Notification.create({
      user: receiverType === "user" ? receiverId : null,
      farmer: receiverType === "farmer" ? receiverId : null,
      farmer_code: receiverType === "farmer" ? receiver.farmer_code : (senderRole === "farmer" ? req.user.farmer_code : null),
      type: "chat_message",
      message: notifMsg,
    });

    // Emit socket
    const io = req.app.get("io");
    if (io) {
      const room = receiverType === "farmer" ? `farmer_${receiverId}` : `user_${receiverId}`;
      io.to(room).emit("new_message", chatMessage);
    }

    res.status(201).json({ success: true, message: chatMessage });
  } catch (err) {
    console.error("❌ Chat send error:", err.message, err.stack);
    res.status(500).json({ success: false, message: "Failed to send message" });
  }
};

exports.getConversation = async (req, res) => {
  try {
    const counterpartId = req.params.id;
    const { listingId, page = 1, limit = 50 } = req.query;
    const currentUserId = req.user.id || req.user._id;
    const currentUserType = req.user.role === "farmer" ? "farmer" : "user";

    if (!mongoose.Types.ObjectId.isValid(currentUserId) || !mongoose.Types.ObjectId.isValid(counterpartId)) {
      return res.status(400).json({ success: false, message: "Invalid user IDs" });
    }
    if (listingId && !mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({ success: false, message: "Invalid listing ID" });
    }

    const filter = {
      $or: [
        { "sender.id": currentUserId, "receiver.id": counterpartId },
        { "sender.id": counterpartId, "receiver.id": currentUserId },
      ],
    };
    if (listingId) filter.listing = new mongoose.Types.ObjectId(listingId);

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const messages = await ChatMessage.find(filter)
      .sort({ created_at: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("listing", "title price location status")
      .lean();

    // Mark unread as read atomically
    await ChatMessage.updateMany(
      { "receiver.id": currentUserId, "sender.id": counterpartId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    // Fetch counterpart with masking
    let counterpart = await Farmer.findById(counterpartId).lean() || await User.findById(counterpartId).lean();
    if (counterpart) {
      counterpart.phone = maskPhone(counterpart.phone);
      counterpart.email = maskEmail(counterpart.email);
    }

    const chatHistory = messages.map((m) => ({
      id: m._id,
      from: m.sender.id.toString() === currentUserId.toString() ? "me" : "them",
      text: m.message,
      isRead: m.isRead,
      createdAt: m.created_at,
      listing: m.listing ? { title: m.listing.title, price: m.listing.price } : null, // Include minimal listing info
    }));

    res.json({
      success: true,
      me: currentUserId.toString(),
      counterpart: counterpart ? {
        displayName: counterpart.username || counterpart.fullname,
        phone: counterpart.phone,
        email: counterpart.email,
      } : null,
      messages: chatHistory,
      hasMore: messages.length === parseInt(limit), // For pagination
    });
  } catch (err) {
    console.error("❌ Chat fetch error:", err.message, err.stack);
    res.status(500).json({ success: false, message: "Failed to fetch conversation" });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const currentUserId = req.user.id || req.user._id;
    if (!mongoose.Types.ObjectId.isValid(currentUserId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }
    const count = await ChatMessage.countDocuments({ "receiver.id": currentUserId, isRead: false });
    res.json({ success: true, unread: count });
  } catch (err) {
    console.error("❌ Unread count error:", err.message, err.stack);
    res.status(500).json({ success: false, message: "Failed to fetch unread count" });
  }
};

exports.getRecentChats = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id || req.user._id);

    const messages = await ChatMessage.aggregate([
      { $match: { $or: [{ "sender.id": userId }, { "receiver.id": userId }] } },
      { $sort: { created_at: -1 } },
      { $addFields: { otherUserId: { $cond: [{ $eq: ["$sender.id", userId] }, "$receiver.id", "$sender.id"] } } },
      { $group: { _id: "$otherUserId", lastMessage: { $first: "$message" }, createdAt: { $first: "$created_at" } } },
      { $sort: { createdAt: -1 } },
      { $limit: 30 }
    ]);

    if (!messages.length) {
      return res.json({ success: true, recent: [] });
    }

    const enriched = await Promise.all(messages.map(async (m) => {
      const uid = m._id;
      let participant = await Farmer.findById(uid).select("fullname farmer_code phone email").lean() ||
                        await User.findById(uid).select("fullname username role phone email").lean();
      if (!participant) return null;
      return {
        _id: uid,
        name: participant.fullname || participant.username || "Unknown",
        role: participant.role || (participant.farmer_code ? "farmer" : "user"),
        farmer_code: participant.farmer_code || null,
        phone: maskPhone(participant.phone),
        email: maskEmail(participant.email),
        lastMessage: m.lastMessage,
        lastActive: m.createdAt,
      };
    }));

    const cleaned = enriched.filter(Boolean);

    res.json({ success: true, recent: cleaned });
  } catch (err) {
    console.error("❌ Recent chats error:", err.message, err.stack);
    res.status(500).json({ success: false, message: "Failed to load recent chat list" });
  }
};