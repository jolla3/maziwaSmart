const { User, SellerApprovalRequest } = require("../models/model");
const { sendMail } = require("../utils/emailService");

// ✅ Get all pending seller approval requests
exports.getPendingSellerRequests = async (req, res) => {
  try {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ message: "❌ Not authorized" });
    }

    const requests = await SellerApprovalRequest.find({ status: "pending" })
      .populate("seller_id", "fullname email role createdAt");

    res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (err) {
    console.error("❌ Fetch pending seller requests error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


// ✅ Review (approve/reject) seller request
exports.reviewSellerRequest = async (req, res) => {
  try {
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ message: "❌ Not authorized" });
    }

    const { id } = req.params;
    const { decision } = req.body;
    if (!["approve", "reject"].includes(decision))
      return res.status(400).json({ message: "Invalid decision. Use 'approve' or 'reject'." });

    const request = await SellerApprovalRequest.findById(id);
    if (!request)
      return res.status(404).json({ message: "Seller request not found." });

    const seller = await User.findById(request.seller_id);
    if (!seller)
      return res.status(404).json({ message: "Seller not found." });

    request.status = decision === "approve" ? "approved" : "rejected";
    seller.is_approved_seller = decision === "approve";
    await request.save();
    await seller.save();

    // ✅ Send email notification to seller
    const statusText = decision === "approve" ? "approved ✅" : "rejected ❌";
    const html = `
      <div style="font-family: Arial; max-width: 600px;">
        <h2 style="color:#2eaadc;">Seller Account ${statusText}</h2>
        <p>Hi ${seller.fullname || "Seller"},</p>
        <p>Your seller account request has been <b>${statusText}</b> by MaziwaSmart SuperAdmin.</p>
        ${
          decision === "approve"
            ? `<p>You can now log in and start posting your listings 🚀.</p>`
            : `<p>You may reapply later with more accurate details.</p>`
        }
        <hr>
        <small>© ${new Date().getFullYear()} MaziwaSmart</small>
      </div>
    `;

    await sendMail(seller.email, `Seller Request ${statusText}`, html);

    res.status(200).json({
      success: true,
      message: decision === "approve" ? "✅ Seller approved" : "🚫 Seller rejected",
      seller: { id: seller._id, email: seller.email, status: request.status },
    });
  } catch (err) {
    console.error("❌ Review seller request error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

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
