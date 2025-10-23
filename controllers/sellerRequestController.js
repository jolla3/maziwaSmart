const { User } = require("../models/model");
const { Resend } = require("resend");

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Temporary OTP store (replace with Redis or DB later)
const otpStore = {}

// ✅ Step 1: Request Approval (Send OTP)
exports.requestApproval = async (req, res) => {
  try {
    const { email, country } = req.body;

    if (!email || !country) {
      return res
        .status(400)
        .json({ success: false, message: "Email and country are required." });
    }

    // Verify user exists and is a seller
    const user = await User.findOne({ email, role: "seller" });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Seller account not found." });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expiresAt: Date.now() + 10 * 60 * 1000 }; // 10 min expiry

    // Send OTP using Resend
    const { error } = await resend.emails.send({
      from: "MaziwaSmart <no-reply@maziwasmart.com>",
      to: email, 
      subject: "MaziwaSmart Seller Approval OTP",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 16px;">
          <h2>🔐 Seller Verification</h2>
          <p>Your OTP code is:</p>
          <h1 style="letter-spacing: 6px;">${otp}</h1>
          <p>This code will expire in <strong>10 minutes</strong>.</p>
          <hr />
          <p style="font-size: 12px; color: gray;">
            If you did not request this, please ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("❌ Resend Error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Failed to send OTP." });
    }

    res.json({ success: true, message: "OTP sent successfully." });
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
    return res
      .status(400)
      .json({ success: false, message: "No OTP request found." });
  if (Date.now() > record.expiresAt)
    return res
      .status(400)
      .json({ success: false, message: "OTP expired. Please request again." });
  if (record.otp !== otp)
    return res.status(400).json({ success: false, message: "Invalid OTP." });

  // OTP verified successfully
  delete otpStore[email];
  res.json({ success: true, message: "OTP verified successfully." });
};

// ✅ Step 3: Complete Seller Setup (phone + password + county + consent)
exports.completeSellerSetup = async (req, res) => {
  try {
    const { email, phone, password, confirmPassword, county, consent } =
      req.body;

    if (!email || !phone || !password || !confirmPassword || !county) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required." });
    }

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match." });
    }

    if (!consent) {
      return res
        .status(400)
        .json({ success: false, message: "You must accept the terms." });
    }

    const user = await User.findOne({ email, role: "seller" });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "Seller not found." });

    // Update user with setup info
    user.phone = phone;
    user.password = password; // bcrypt handled in model pre-save hook
    user.county = county;
    user.is_approved_seller = false; // still pending
    await user.save();

    res.json({
      success: true,
      message:
        "Seller setup complete. Await admin approval within the next few hours.",
      user: {
        email: user.email,
        phone: user.phone,
        county: user.county,
        is_approved_seller: user.is_approved_seller,
      },
    });
  } catch (err) {
    console.error("❌ Complete Seller Setup Error:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};
