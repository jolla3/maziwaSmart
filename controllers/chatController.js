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

function getDisplayName(user) {
  return user.username || user.fullname || user.name || "Unknown User";
}

// ---------------------------
// Send a message (global or tied to a listing)
// ---------------------------
exports.sendMessage = async (req, res) => {
  try {
    const { receiver, message, listingId } = req.body;
    const senderId = req.user._id; // ensure middleware sets _id

    if (!receiver || !message) {
      return res.status(400).json({ success: false, message: "Receiver and message are required" });
    }

    // 1️⃣ Save the chat message
    const chatMessage = await ChatMessage.create({
      sender: senderId,
      receiver,
      message,
      listing: listingId || null
    });

    // 2️⃣ Create notification for the receiver
    await Notification.create({
      user: receiver, // any system user
      cow: null,      // optional for chat
      type: "chat_message",
      message: `💬 New message from ${getDisplayName(req.user)}${listingId ? " about a listing" : ""}`
    });

    // 3️⃣ Emit via socket.io
    const io = req.app.get("io");
    if (io) io.to(receiver.toString()).emit("new_message", chatMessage);

    // 4️⃣ Return success
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
