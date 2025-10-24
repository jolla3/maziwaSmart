const { User } = require("../models/model");
const crypto = require("crypto");
const { sendMail } = require("../utils/emailService");

// Temporary OTP store
const otpStore = {};
const SELLER_TERMS = `
<b>Seller Terms & Conditions — MaziwaSmart Marketplace</b>
1. Honest & Accurate Information: You confirm that all details you provide are true.
2. Responsible Trading: You only list genuine livestock or farm products that you own.
3. No Fraud or Misuse: Fake listings or scams lead to account termination and legal action.
4. Verification: You understand approval by the SuperAdmin is required before listing.
5. Communication: You allow MaziwaSmart to contact you for account and trade updates.
6. Privacy: Your data will be handled securely and confidentially.
7. Suspension: MaziwaSmart may suspend violators of these terms.
`;


// ✅ Step 1: Request approval (send OTP)
exports.requestApproval = async (req, res) => {
  try {
    const { email, country } = req.body;
    if (!email || !country)
      return res.status(400).json({ success: false, message: "Email and country are required." });

    const user = await User.findOne({ email, role: "seller" });
    if (!user)
      return res.status(404).json({ success: false, message: "Seller account not found." });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expiresAt: Date.now() + 10 * 60 * 1000 };

    // ✅ Send OTP email (with non-reply protection)
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 10px;">
        <h2 style="color: #2eaadc;">👋 Hello from MaziwaSmart</h2>
        <p>Your OTP for seller verification is:</p>
        <h1 style="color: #1a73e8; letter-spacing: 4px;">${otp}</h1>
        <p>This code will expire in <b>10 minutes</b>.</p>
        <p style="color:#777;">⚠️ Do not reply to this email. Replies are not monitored.</p>
        <hr />
        <small style="color: #999;">© ${new Date().getFullYear()} MaziwaSmart — Secure Livestock Marketplace</small>
      </div>
    `;

    await sendMail(email, "Your Seller Approval OTP - MaziwaSmart", html);

    res.json({ success: true, message: "OTP sent successfully to your email." });
  } catch (err) {
    console.error("❌ Request Approval Error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};

// ✅ Step 2: Verify OTP
exports.verifyOtp = (req, res) => {
  const { email, otp } = req.body;
  const record = otpStore[email];

  if (!record)
    return res.status(400).json({ success: false, message: "No OTP request found for this email." });
  if (Date.now() > record.expiresAt)
    return res.status(400).json({ success: false, message: "OTP expired." });
  if (record.otp !== otp)
    return res.status(400).json({ success: false, message: "Invalid OTP." });

  delete otpStore[email];
  res.json({ success: true, message: "OTP verified successfully." });
};

// ✅ Step 3: Complete seller setup



exports.completeSellerSetup = async (req, res) => {
  try {
    const { email, phone, password, confirmPassword, county, consent } = req.body;

    if (!email || !phone || !password || !confirmPassword || !county)
      return res.status(400).json({ success: false, message: "All fields are required." });

    if (password !== confirmPassword)
      return res.status(400).json({ success: false, message: "Passwords do not match." });

    if (!consent)
      return res.status(400).json({
        success: false,
        message: "You must read and accept the MaziwaSmart Seller Terms before proceeding.",
        terms: SELLER_TERMS,
      });

    const user = await User.findOne({ email, role: "seller" });
    if (!user) return res.status(404).json({ success: false, message: "Seller not found." });

    // Update user info
    user.phone = phone;
    user.password = password;
    user.county = county;
    user.is_approved_seller = false;
    user.seller_terms_accepted = true;
    user.seller_terms_text = SELLER_TERMS;
    user.seller_terms_accepted_at = new Date();

    await user.save();

    // Notify superadmin
    await sendMail(
      process.env.EMAIL_USER,
      "New Seller Approval Request - MaziwaSmart",
      `
      <div style="font-family: Arial; max-width: 600px;">
        <h3>🔔 New Seller Approval Request</h3>
        <p>A seller has completed their setup and requested approval.</p>
        <ul>
          <li><b>Email:</b> ${email}</li>
          <li><b>Phone:</b> ${phone}</li>
          <li><b>County:</b> ${county}</li>
        </ul>
        <p>Log into your dashboard to review and approve or reject this request.</p>
        <hr>
        <small>© ${new Date().getFullYear()} MaziwaSmart Admin System</small>
      </div>
      `
    );

    res.json({
      success: true,
      message: "Seller setup complete. Awaiting admin approval.",
      user: {
        email,
        phone,
        county,
        is_approved_seller: user.is_approved_seller,
        seller_terms_accepted: user.seller_terms_accepted,
        seller_terms_accepted_at: user.seller_terms_accepted_at,
      },
    });
  } catch (err) {
    console.error("❌ Complete Seller Setup Error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};
