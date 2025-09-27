// controllers/adminController.js
const { User } = require("../models/model");

// ✅ Approve/Revoke Seller (toggle-only, no req.body)
exports.toggleSellerApproval = async (req, res) => {
  try {
    // Only admin or superadmin can do this
    if (!["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ message: "❌ Not authorized" });
    }

    const { id } = req.params; // ✅ comes from router.patch("/:id")

    // Ensure the user exists and is a seller
    const seller = await User.findOne({ _id: id, role: "seller" });
    if (!seller) {
      return res.status(404).json({ message: "❌ Seller not found" });
    }

    // ✅ Toggle the flag on every request
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
    console.error("❌ Toggle seller approval error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
