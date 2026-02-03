// ============================
// FILE: controllers/authController.js
// ============================
const bcrypt = require("bcrypt");
const { User, Porter, Farmer , Manager } = require("../models/model");
const jwt = require("jsonwebtoken");
const { sendWelcomeEmail } = require("../utils/emailService")

const crypto = require('crypto');
const { sendMail } = require("../utils/emailService")

// ============================
// UNIVERSAL REGISTER (Default: buyer)
// ============================
exports.registerAdmin = async (req, res) => {
  try {
    const { username, email, password, phone } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "Username, email, and password are required.",
      });
    }

    // 🔍 Check duplicates
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists." });
    }

    // 🔐 Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🧠 Create new user (default role = buyer)
    const newUser = new User({
      username,
      email,
      phone,
      password: hashedPassword,
      role: "buyer",         // 👈 Default role
      is_approved_seller: false,
    });

    await newUser.save();

    // ✅ Return success
    res.status(201).json({
      success: true,
      message: `Welcome ${newUser.username}! Your account has been created.`,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
      },
    });
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({
      success: false,
      message: "Registration failed.",
      error: err.message,
    });
  }
};

// loginController.js
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    // -----------------------------------------
    // CENTRALIZED MODEL CONFIG (NO HARDCODING)
    // -----------------------------------------
    const roleConfig = [
      {
        model: User,
        getRole: (u) => u.role,
        getCode: () => ""
      },
      {
        model: Farmer,
        getRole: () => "farmer",
        getCode: (u) => u.farmer_code
      },
      {
        model: Porter,
        getRole: () => "porter",
        getCode: () => u.porter_code || ""
      },
      {
        model: Manager,
        getRole: () => "manager",
        getCode: (u) => u.farmer_code
      }
    ];

    let user = null;
    let role = "";
    let code = "";

    // -----------------------------------------
    // AUTO-MATCH USER BY EMAIL
    // -----------------------------------------
    for (const cfg of roleConfig) {
      const found = await cfg.model.findOne({ email });

      if (found) {
        user = found;
        role = cfg.getRole(found);
        code = cfg.getCode(found) || "";
        break;
      }
    }

    // -----------------------------------------
    // ACCOUNT NOT FOUND
    // -----------------------------------------
    if (!user) {
      return res.status(404).json({ message: "Account not found" });
    }

    // -----------------------------------------
    // CHECK ACTIVE STATUS
    // -----------------------------------------
    if (user.is_active === false) {
      return res.status(403).json({
        message: "Account is deactivated. Contact admin."
      });
    }

    // -----------------------------------------
    // NO PASSWORD SET
    // -----------------------------------------
    if (!user.password) {
      return res.status(400).json({
        message: "This account has no login credentials set."
      });
    }

    // -----------------------------------------
    // PASSWORD CHECK
    // -----------------------------------------
    const validPass = await bcrypt.compare(password, user.password);

    if (!validPass) {
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    // -----------------------------------------
    // JWT PAYLOAD
    // -----------------------------------------
   const payload = {
  id: user._id.toString(),
  name: (user.name || user.fullname || user.username || "").trim(),
  email: user.email?.trim() || "",
  role, // ✅ the computed role
  ...(typeof code === "string" && code.trim() ? { code: code.trim() } : {}),
};

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });

    // -----------------------------------------
    // SUCCESS RESPONSE
    // -----------------------------------------
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      role,
      user: payload
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: err.message
    });
  }
};

// ----------------------------
// REGISTER SELLER
// ----------------------------
exports.registerSeller = async (req, res) => {
  try {
    const { username, phone, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "username, email, and password are required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const seller = new User({
      username,
      phone,
      email,
      password: hashedPassword,
      role: "seller",
      is_approved_seller: false // ✅ matches schema
    });

    await seller.save();

    sendWelcomeEmail(seller.email, seller.username, "seller")
    .catch(err => console.error("Seller welcome email failed:", err));

    res.status(201).json({
      message: "✅ Seller registered. Awaiting approval by admin.",
      seller: {
        id: seller._id,
        username: seller.username,
        email: seller.email,
        is_approved_seller: seller.is_approved_seller,
      },
    });
  } catch (err) {
    console.error("❌ Register seller error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
// ----------------------------
// GOOGLE LOGIN / REGISTER
// ----------------------------

exports.googleCallback = async (req, res) => {
  try {
    const user = req.user;

    // FRONTEND URL MUST BE FRONTEND. NOT BACKEND.
    const FRONTEND = process.env.FRONTEND_URL || "https://maziwa-smart.vercel.app";

    if (!user || !user.email) {
      return res.redirect(
        `${FRONTEND}/google-callback?error=No email found`
      );
    }

    // Resolve role cleanly
    const role =
      user._collection === "Farmer"
        ? "farmer"
        : user.role || "buyer";

    const code = user.farmer_code || "";

    // Build token
    const payload = {
      id: user._id,
      name: user.username || user.fullname || "Unnamed User",
      email: user.email,
      role,
      ...(code && { code })
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });

    // If it's first time Google login → redirect to frontend /set-password
    if (!user.password) {
      return res.redirect(`${FRONTEND}/set-password?token=${token}`);
    }

    // Normal login
    return res.redirect(
      `${FRONTEND}/google-callback?token=${token}&role=${role}&name=${encodeURIComponent(
        payload.name
      )}`
    );

  } catch (err) {
    console.error("googleCallback error:", err);

    const FRONTEND = process.env.FRONTEND_URL || "https://maziwa-smart.vercel.app";

    return res.redirect(
      `${FRONTEND}/google-callback?error=Google login failed`
    );
  }
};

// ------------------------------------------------------------------
// COMPLETE GOOGLE REGISTRATION WITH PASSWORD
// ------------------------------------------------------------------
exports.setPassword = async (req, res) => {
  try {
    const { token, password, phone, location, farmer_code } = req.body;

    console.log("DEBUG: Incoming body:", req.body);

    if (!token || !password) {
      return res.status(400).json({ message: "Missing token or password" });
    }

    // Decode token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.error("JWT ERROR:", err);
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired" });
      }
      return res.status(401).json({ message: "Invalid token" });
    }

    console.log("DEBUG: JWT Decoded:", decoded);

    const hashedPassword = await bcrypt.hash(password, 10);

    // =====================================================================
    // FARMER REGISTRATION
    // =====================================================================
    // FARMER FLOW
if (decoded.role === "farmer") {
  const farmer = await Farmer.findById(decoded.id);

  if (!farmer) {
    return res.status(404).json({ message: "Farmer not found" });
  }

  if (!phone || !farmer_code) {
    return res.status(400).json({
      message: "Phone and farmer_code required for farmers"
    });
  }

  // PREVENT DUPLICATE FARMER CODE
  const existing = await Farmer.findOne({
    farmer_code,
    _id: { $ne: farmer._id }
  });

  if (existing) {
    return res.status(409).json({
      message: `Farmer code ${farmer_code} already exists. Choose another one.`
    });
  }

  // UPDATE FARMER
  farmer.password = hashedPassword;
  farmer.phone = phone;
  farmer.farmer_code = farmer_code;
  if (location) farmer.location = location;

  await farmer.save();

  return res.json({
    message: "Farmer registration complete",
    success: true
  });
}

    // =====================================================================
    // NORMAL USERS (buyer, seller, manager, porter, admin, etc.)
    // =====================================================================
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.password = hashedPassword;

    if (phone) {
      user.phone = phone;
    }

    await user.save();

    return res.json({
      message: "Registration complete",
      success: true
    });

  } catch (err) {
    console.error("SET PASSWORD CONTROLLER ERROR:", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
};
// 🧩 Register Farmer Controller
exports.registerFarmer = async (req, res) => {
  try {
    const { fullname, phone, email, password, location, photo , farmer_code} = req.body;

    // 🛑 Validate required fields
    if (!fullname || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Full name, phone, and password are required.',
      });
    }

    // 🔍 Check duplicates (by phone or email)
    const existing = await Farmer.findOne({
      $or: [{ phone }, { email }],
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Farmer already exists with this phone or email.',
      });
    }

    // 🔐 Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🧮 Generate unique farmer code

    // ✨ Create new farmer
    const newFarmer = new Farmer({
      fullname,
      farmer_code,
      phone,
      email,
      password: hashedPassword,
      photo,
      location,
      farmer_code,
      role: 'farmer',
      is_active: true,
    });

    await newFarmer.save();
    // Send welcome email (non-blocking)
    sendWelcomeEmail(newFarmer.email, newFarmer.fullname, "farmer")
      .catch(err => console.error("Welcome email failed:", err)); // Don't fail registration

    // ✅ Respond success
    res.status(201).json({
      success: true,
      message: `Welcome ${newFarmer.fullname}! Your farmer account has been created.`,
      farmer: {
        id: newFarmer._id,
        fullname: newFarmer.fullname,
        farmer_code: newFarmer.farmer_code,
        phone: newFarmer.phone,
        email: newFarmer.email,
        location: newFarmer.location,
        role: newFarmer.role,
        join_date: newFarmer.join_date,
      },
    });
  } catch (err) {
    console.error('❌ Farmer registration error:', err);
    res.status(500).json({
      success: false,
      message: 'Farmer registration failed.',
      error: err.message,
    });
  }
};



// Forgot Password
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) return res.status(400).json({ message: "Email required" });

  // Rate limit check (pseudo — use express-rate-limit or redis in real)
  // if (tooManyRequests(ip, email)) return 429;

  let user = null;
  let Model = null;

  // Try all models — order by most common first
  for (const M of [User, Farmer /* , Porter, Manager */]) {
    user = await M.findOne({ email: email.trim() });
    if (user) {
      Model = M;
      break;
    }
  }

  // Always respond 200 — security
  if (!user || !user.password) {
    return res.status(200).json({ message: "If account exists, reset link sent" });
  }

  // Generate secure token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(resetToken).digest('hex');

  user.resetToken = hashed;
  user.resetExpiry = Date.now() + 3600 * 1000; // 1h
  await user.save();

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const html = `
    <h2>Reset Your MaziwaSmart Password</h2>
    <p>Click below to reset (link expires in 1 hour):</p>
    <a href="${resetUrl}" style="background:#00bcd4;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">
      Reset Password
    </a>
    <p>If you didn't request this, ignore this email.</p>
    <p>— MaziwaSmart Team</p>
  `;

  await sendMail(email, "MaziwaSmart Password Reset", html);

  res.status(200).json({ message: "Reset link sent if account exists" });
};


// Reset Password
exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword?.trim()) {
    return res.status(400).json({ message: "Token and new password required" });
  }

  // Basic strength (you can make stricter)
  if (newPassword.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters" });
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  let user = null;
  let Model = null;

  for (const M of [User, Farmer /* , others */]) {
    user = await M.findOne({
      resetToken: hashedToken,
      resetExpiry: { $gt: Date.now() }
    });
    if (user) {
      Model = M;
      break;
    }
  }

  if (!user) {
    return res.status(400).json({ message: "Invalid or expired token" });
  }

  // Optional: prevent reuse of same password
  const sameAsOld = await bcrypt.compare(newPassword, user.password);
  if (sameAsOld) {
    return res.status(400).json({ message: "New password must be different" });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.resetToken = undefined;
  user.resetExpiry = undefined;
  await user.save();

  res.status(200).json({ message: "Password reset successful. Please log in." });
};

// Get Profile (auth protected)
exports.getProfile = async (req, res) => {
  try {
    const { id, role } = req.user; // From verifyToken middleware

    let profile;

    switch (role) {
      case 'farmer':
        profile = await Farmer.findById(id);
        break;
      case 'seller':
      case 'buyer':
      case 'admin':
      case 'broker':
      case 'manager':
        profile = await User.findById(id);
        break;
      // Add porter etc. if they have profiles
      default:
        return res.status(403).json({ message: "Unknown role" });
    }

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // Strip sensitive fields
    const safeProfile = profile.toObject();
    delete safeProfile.password;
    delete safeProfile.resetToken;
    delete safeProfile.resetExpiry;

    res.status(200).json({ success: true, profile: safeProfile });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// Update Profile (auth protected, partial)
exports.updateProfile = async (req, res) => {
  const { id, role } = req.user;
  const updates = req.body;

  // Role-specific allowed fields
  const allowedFields = {
    farmer: ['fullname', 'phone', 'location', 'photo'],
    seller: ['username', 'phone', 'photo'],
    // add others...
  };

  const fields = allowedFields[role] || [];
  if (!fields.length) return res.status(403).json({ message: "No updatable fields for your role" });

  const sanitized = {};
  for (const key of fields) {
    if (updates[key] !== undefined) sanitized[key] = updates[key];
  }

  if (Object.keys(sanitized).length === 0) {
    return res.status(400).json({ message: "No valid fields to update" });
  }

  let Model = role === 'farmer' ? Farmer : User;
  const updated = await Model.findByIdAndUpdate(id, sanitized, { new: true, runValidators: true });

  if (!updated) return res.status(404).json({ message: "Profile not found" });

  res.status(200).json({ success: true, message: "Profile updated", profile: updated });
};

