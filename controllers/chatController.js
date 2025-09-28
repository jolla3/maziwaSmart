const { ChatMessage, Farmer, User, Notification } = require('../models/model');

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

// ---------------------------
// Send a message (global or tied to a listing)
// ---------------------------
exports.sendMessage = async (req, res) => {
  try {
    const { receiver, message, listingId } = req.body;
    const sender = req.user.id;


    const chatMessage = new ChatMessage({
      sender,
      receiver,
      message,
      listing: listingId || null, // ✅ optional link to listing
    });

    await chatMessage.save();

    // Notify receiver
    await Notification.create({
      farmer_code: 0, // keep as 0 since receiver could be farmer or user
      cow: null,
      type: "chat_message",
      message: `💬 New message from ${req.user.username}${
        listingId ? " about a listing" : ""
      }`,
    });

    // Emit via socket.io
    const io = req.app.get("io");
    io.to(receiver.toString()).emit("new_message", chatMessage);

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
    const { userId } = req.params;   // counterpart
    const { listingId } = req.query; // optional filter
    const currentUser = req.user.id;

    // 🔎 Messages filter
    const filter = {
      $or: [
        { sender: currentUser, receiver: userId },
        { sender: userId, receiver: currentUser },
      ],
    };
    if (listingId) filter.listing = listingId;

    // 1️⃣ Fetch messages
    const messages = await ChatMessage.find(filter)
      .sort({ created_at: 1 })
      .populate("listing", "title price");

    // 2️⃣ Counterpart details (Farmer OR User)
    let counterpart = {};
    const profile =
      (await Farmer.findById(userId).lean()) ||
      (await User.findById(userId).lean());

    if (profile) {
      counterpart = {
        fullname: profile.fullname || profile.username || null,
        phone: maskPhone(profile.phone),
        email: maskEmail(profile.email),
        location: profile.location || null,
      };
    }

    res.json({
      success: true,
      messages,
      counterpart,
    });
  } catch (err) {
    console.error("❌ Chat fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch conversation" });
  }
};
