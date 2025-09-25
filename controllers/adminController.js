// controllers/adminController.js
const { User } = require("../models/model");

// ✅ Approve or revoke external seller
exports.toggleSellerApproval = async (req, res) => {
  try {
    // only superadmin can do this
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "❌ Only SuperAdmin can approve sellers" });
    }

    const { sellerId } = req.params;
    const { approve } = req.body; // true = approve, false = revoke

    const seller = await User.findByIdAndUpdate(
      sellerId,
      { is_approved_seller: approve },
      { new: true }
    );

    if (!seller) {
      return res.status(404).json({ message: "❌ Seller not found" });
    }

    res.status(200).json({
      message: approve ? "✅ Seller approved" : "🚫 Seller revoked",
      seller,
    });
  } catch (err) {
    console.error("❌ Toggle seller approval error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
