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

exports.sendMessage = async (req, res) => {
  try {
    const { receiver, message, listingId } = req.body;
    const senderId = req.user.id;

    if (!receiver || !message) {
      return res.status(400).json({ success: false, message: "Receiver and message are required" });
    }

    // 1️⃣ Save chat message
    const chatMessage = await ChatMessage.create({
      sender: senderId,
      receiver,
      message,
      listing: listingId || null
    });

    // 2️⃣ Build notification message
    let notifMsg = `💬 New message from ${getDisplayName(req.user)}`;
    if (listingId) {
      const listing = await Listing.findById(listingId).select("title price").lean();
      if (listing) {
        notifMsg += ` about "${listing.title}" (Ksh ${listing.price})`;
      } else {
        notifMsg += " about a listing"; // fallback
      }
    }

    // 3️⃣ Notify receiver
    await Notification.create({
      user: receiver,
      cow: null,
      type: "chat_message",
      message: notifMsg
    });

    // 4️⃣ Emit via socket.io
    const io = req.app.get("io");
    if (io) io.to(receiver.toString()).emit("new_message", chatMessage);

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
    const { userId } = req.params;    // the other person
    const { listingId } = req.query;  // optional filter
    const currentUser = req.user.id;

    // 🔎 Build filter
    const filter = {
      $or: [
        { sender: currentUser, receiver: userId },
        { sender: userId, receiver: currentUser }
      ]
    };
    if (listingId) filter.listing = listingId;

    // 1️⃣ Fetch all messages in order
    const messages = await ChatMessage.find(filter)
      .sort({ created_at: 1 })
      .populate("listing", "title price location status")
      .lean();

    // 2️⃣ Get counterpart profile (Farmer or User)
    let counterpart = await Farmer.findById(userId).lean();
    if (!counterpart) counterpart = await User.findById(userId).lean();

    // Standardize counterpart
    const counterpartInfo = counterpart
      ? {
          displayName: getDisplayName(counterpart),
          phone: maskPhone(counterpart.phone),
          email: maskEmail(counterpart.email),
          location: counterpart.location || null
        }
      : null;

    // 3️⃣ Standardize messages (so frontend doesn’t have to guess)
    const chatHistory = messages.map(m => ({
      id: m._id,
      from: m.sender.toString() === currentUser.toString() ? "me" : "them",
      text: m.message,
      createdAt: m.created_at
    }));

    // 4️⃣ If listing exists, attach once
    let listingInfo = null;
    if (listingId && messages.length && messages[0].listing) {
      listingInfo = {
        id: messages[0].listing._id,
        title: messages[0].listing.title,
        price: messages[0].listing.price,
        location: messages[0].listing.location,
        status: messages[0].listing.status
      };
    }

    // Final payload
    res.json({
      success: true,
      counterpart: counterpartInfo,
      listing: listingInfo,
      messages: chatHistory
    });
  } catch (err) {
    console.error("❌ Chat fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch conversation" });
  }
};
