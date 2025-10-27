const { User, SellerApprovalRequest } = require("../models/model");
const { sendMail } = require("../utils/emailService");

// ✅ Get all pending seller approval requests
exports.getPendingSellerRequests = async (req, res) => {
  try {
    const {status} = req.query
    // ✅ Allow both admin and superadmin
    if (!["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "❌ Not authorized" });
    }

    const filter =status?{status}:{}
    // ✅ Populate seller info including phone and county from SellerApprovalRequest
    const requests = await SellerApprovalRequest.find(filter)
      .populate("seller_id", "fullname username email role createdAt")
      .lean(); // Use lean for better performance

    // ✅ Map and include phone/county from the request itself
    const formattedRequests = requests.map(req => ({
      ...req,
      phone: req.phone,
      county: req.county,
      country: req.country
    }));

    console.log(`✅ Found ${formattedRequests.length} pending requests`);

    res.status(200).json({
      success: true,
      count: formattedRequests.length,
      requests: formattedRequests,
    });
  } catch (err) {
    console.error("❌ Fetch pending seller requests error:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// ✅ Review (approve/reject) seller request
exports.reviewSellerRequest = async (req, res) => {
  try {
    // ✅ Allow both admin and superadmin
    if (!["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "❌ Not authorized" });
    }

    const { id } = req.params
    const { decision } = req.body
    
    if (!["approve", "reject"].includes(decision)) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid decision. Use 'approve' or 'reject'." 
      });
    }

    const request = await SellerApprovalRequest.findById(id);
    if (!request) {
      return res.status(404).json({ success: false, message: "Seller request not found." });
    }

    const seller = await User.findById(request.seller_id);
    if (!seller) {
      return res.status(404).json({ success: false, message: "Seller not found." });
    }

    // Update status
    request.status = decision === "approve" ? "approved" : "rejected";
    seller.is_approved_seller = decision === "approve";
    
    await request.save();
    await seller.save();

    // ✅ Send email notification to seller
    const statusText = decision === "approve" ? "Approved ✅" : "Rejected ❌";
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2EAADC; margin-bottom: 10px;">MaziwaSmart</h1>
          <div style="width: 60px; height: 4px; background: #2EAADC; margin: 0 auto;"></div>
        </div>
        
        <div style="background: #f7fafc; padding: 30px; border-radius: 12px; margin-bottom: 20px;">
          <h2 style="color: ${decision === "approve" ? "#48bb78" : "#fc8181"}; margin-bottom: 15px;">
            Seller Account ${statusText}
          </h2>
          <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
            Hi <strong>${seller.fullname || seller.username || "Seller"}</strong>,
          </p>
          <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
            Your seller account request has been <strong>${statusText}</strong> by the MaziwaSmart Admin Team.
          </p>
          ${
            decision === "approve"
              ? `<div style="background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; margin-top: 20px;">
                   <strong>🎉 Congratulations!</strong><br/>
                   You can now log in to your account and start posting your livestock and farm product listings.
                 </div>`
              : `<div style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 8px; margin-top: 20px;">
                   <strong>Note:</strong><br/>
                   You may reapply later with more accurate information. Please ensure all details are correct.
                 </div>`
          }
        </div>
        
        <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0;">
          <p style="color: #94a3b8; font-size: 13px; margin: 0;">
            © ${new Date().getFullYear()} MaziwaSmart - Secure Livestock Marketplace
          </p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 5px;">
            This is an automated email. Please do not reply.
          </p>
        </div>
      </div>
    `;

    // Send email (don't block the response if it fails)
    sendMail(seller.email, `MaziwaSmart - Seller Request ${statusText}`, html)
      .catch(err => console.error("Email sending failed:", err));

    res.status(200).json({
      success: true,
      message: decision === "approve" ? "✅ Seller approved successfully" : "🚫 Seller rejected",
      seller: { 
        id: seller._id, 
        email: seller.email, 
        fullname: seller.fullname,
        status: request.status 
      },
    });
  } catch (err) {
    console.error("❌ Review seller request error:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// ✅ Toggle seller approval (manual override)
exports.toggleSellerApproval = async (req, res) => {
  try {
    // Allow both admin and superadmin
    if (!["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "❌ Not authorized" });
    }

    const { id } = req.params;

    // Ensure the user exists and is a seller
    const seller = await User.findOne({ _id: id, role: "seller" });
    if (!seller) {
      return res.status(404).json({ success: false, message: "❌ Seller not found" });
    }

    // ✅ Toggle the approval flag
    seller.is_approved_seller = !seller.is_approved_seller;
    await seller.save();

    res.status(200).json({
      success: true,
      message: seller.is_approved_seller ? "✅ Seller approved" : "🚫 Seller approval revoked",
      seller: {
        id: seller._id,
        username: seller.username,
        email: seller.email,
        is_approved_seller: seller.is_approved_seller,
      },
    });
  } catch (err) {
    console.error("❌ Toggle seller approval error:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};