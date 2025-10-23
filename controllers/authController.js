// ============================
// FILE: controllers/authController.js
// ============================
const bcrypt = require("bcrypt");
const { User, Porter, Farmer } = require("../models/model");
const jwt = require("jsonwebtoken");


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

// ----------------------------
// NORMAL LOGIN
// ----------------------------
// controllers/authController.js
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    let user = null;
    let role = "";
    let code = "";

    // 1️⃣ Try system user (admin, superadmin, broker, buyer, seller, manager)
    user = await User.findOne({ email });
    if (user) {
      role = user.role;
      code = ""; // system users don’t have a code
    }

    // 2️⃣ Try farmer
    if (!user) {
      user = await Farmer.findOne({ email });
      if (user) {
        role = "farmer";
        code = user.farmer_code;
      }
    }

    // 3️⃣ Try porter
    if (!user) {
      user = await Porter.findOne({ email });
      if (user) {
        role = "porter";
        code = user.porter_code || "";
      }
    }

    // 🚫 Not found
    if (!user) {
      return res.status(404).json({ message: "❌ Account not found" });
    }

    // 🚫 Check if inactive
    if (user.is_active === false) {
      return res.status(403).json({
        message: "🚫 Account is deactivated. Please contact admin.",
      });
    }

    // 🚫 No password set
    if (!user.password) {
      return res.status(400).json({
        message: `❌ This ${role} has no login credentials.`,
      });
    }

    // ✅ Compare passwords
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) {
      return res.status(400).json({
        message: "❌ Invalid credentials.",
      });
    }

    // 🎯 Build payload
    const payload = {
      id: user._id,
      name: user.name || user.fullname || user.username || "",
      email: user.email,
      role,
      ...(code && { code }), // include code if available
    };

    // 🔐 Generate token
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // ✅ Success
    res.status(200).json({
      success: true,
      message: "✅ Login successful",
      token,
      role,
      user: payload,
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed.",
      error: error.message,
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
    const { displayName, emails, photos } = req.user || {};

    // ✅ Safely extract email
    const email = Array.isArray(emails) && emails.length > 0 ? emails[0].value : null;

    // 🚨 Stop if no email
    if (!email) {
      console.error("❌ Google login failed: No email returned from Google.");
      const frontendURL =
        process.env.FRONTEND_URL ||
        "https://maziwa-smart.vercel.app" ||
        "http://localhost:3000";
      return res.redirect(
        `${frontendURL}/google-login?error=${encodeURIComponent("No email found from Google account. Please use a valid Google account.")}`
      );
    }

    let user = await User.findOne({ email });
    let role = "buyer";
    let code = "";
    let isNewUser = false;

    if (!user) {
      const farmer = await Farmer.findOne({ email });

      if (farmer) {
        user = farmer;
        role = "farmer";
        code = farmer.farmer_code;
      } else {
        // ✅ Create a new Google buyer user
        user = new User({
          username: displayName || "Unnamed User",
          email,
          role: "buyer",
          photo: Array.isArray(photos) && photos.length > 0 ? photos[0].value : null,
          email_verified: true,
        });
        await user.save();
        isNewUser = true;
      }
    } else {
      role = user.role;
    }

    // Build JWT payload
    const payload = {
      id: user._id,
      name: user.username || user.fullname || displayName,
      email: user.email,
      role,
      code,
    };

    // Sign JWT
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

    // Base frontend URL
    const frontendURL =
      process.env.FRONTEND_URL ||
      "https://maziwa-smart.vercel.app" ||
      "http://localhost:3000";

    // Redirect logic
    if (isNewUser) {
      return res.redirect(`${frontendURL}/set-password?token=${token}`);
    } else {
      return res.redirect(
        `${frontendURL}/google-login?token=${token}&role=${role}&name=${encodeURIComponent(payload.name)}`
      );
    }
  } catch (err) {
    console.error("❌ Google callback error:", err);

    const frontendURL =
      process.env.FRONTEND_URL ||
      "https://maziwa-smart.vercel.app" ||
      "http://localhost:3000";

    res.redirect(
      `${frontendURL}/google-login?error=${encodeURIComponent("Google login failed")}`
    );
  }
}


// ✅ Controller to set password after Google signup
exports.setPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(400).json({ message: "Missing token or password." });

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user)
      return res.status(404).json({ message: "User not found." });

    // Hash and update password
    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password set successfully. You can now log in." });
  } catch (err) {
    console.error("❌ Error in setPassword:", err)
    res.status(500).json({ message: "Server error while setting password." });
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