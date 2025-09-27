// controllers/adminController.js
const { User } = require("../models/model");

// ✅ Approve/Revoke Seller
exports.toggleSellerApproval = async (req, res) => {
  try {
    // Only admin or superadmin can do this
    if (!["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ message: "❌ Not authorized" });
    }

    const { sellerId } = req.params;

    // Ensure the user is a seller
    const seller = await User.findOne({ _id: sellerId, role: "seller" });
    if (!seller) {
      return res.status(404).json({ message: "❌ Seller not found" });
    }

    // Toggle approval instead of relying on client value
    seller.is_approved_seller = !seller.is_approved_seller;
    await seller.save();

    res.status(200).json({
      message: seller.is_approved_seller ? "✅ Seller approved" : "🚫 Seller revoked",
      seller: {
        id: seller._id,
        username: seller.username,
        email: seller.email,
        is_approved_seller: seller.is_approved_seller,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
