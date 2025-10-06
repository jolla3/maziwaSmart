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

    // 1️⃣ Check if it's a system user (admin, superadmin, broker, buyer, seller, manager)
    user = await User.findOne({ email });
    if (user) {
      role = user.role; // use directly from schema
      code = ""; // system users don’t have a farmer/porter code
    }

    // 2️⃣ Farmer
    if (!user) {
      user = await Farmer.findOne({ email });
      if (user) {
        role = "farmer";
        code = user.farmer_code;
      }
    }

    // 3️⃣ Porter
    if (!user) {
      user = await Porter.findOne({ email });
      if (user) {
        role = "porter";
        code = user.porter_code || "";
      }
    }

    // 🚨 Account not found
    if (!user) {
      return res.status(404).json({ message: "❌ Account not found" });
    }

    // 🚨 No password set
    if (!user.password) {
      return res
        .status(400)
        .json({ message: `❌ This ${role} has no login credentials` });
    }

    // ✅ Validate password
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) {
      return res.status(400).json({ message: "❌ Invalid password" });
    }

    // ✅ JWT Payload
    const payload = {
      id: user._id,
      name: user.name || user.fullname || user.username || "",
      email: user.email,
      role,
      code,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // ✅ Success response
    res.status(200).json({
      message: "✅ Login successful",
      token,
      role,
      user: {
        id: user._id,
        name: user.name || user.fullname || user.username || "",
        email: user.email,
        role,
        code,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ message: "Login failed", error: error.message });
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
    const { displayName, emails, photos } = req.user;
    const email = emails[0].value;

    let user = await User.findOne({ email });
    let role = "buyer";
    let code = "";

    if (!user) {
      // If not in Users, check Farmer
      const farmer = await Farmer.findOne({ email });

      if (farmer) {
        user = farmer;
        role = "farmer";
        code = farmer.farmer_code;
      } else {
        // Otherwise → create new Buyer
        user = new User({
          username: displayName,
          email,
          role: "buyer",
          photo: photos?.[0]?.value,
          email_verified: true,
        });
        await user.save();
      }
    } else {
      role = user.role; // existing user's role
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

    // ✅ UPDATED: Redirect to frontend with token in URL
    const frontendURL = process.env.FRONTEND_URL || "http://localhost:3000";
    
    // Redirect to Google login page with token and role as query params
    res.redirect(`${frontendURL}/google-login?token=${token}&role=${role}&name=${encodeURIComponent(payload.name)}`);
    
  } catch (err) {
    console.error("❌ Google callback error:", err);
    
    // Redirect to frontend with error
    const frontendURL = process.env.FRONTEND_URL || "http://localhost:3000";
    res.redirect(`${frontendURL}/google-login?error=${encodeURIComponent('Google login failed')}`);
  }
};