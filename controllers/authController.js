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
      id: user._id,
      name: user.name || user.fullname || user.username || "",
      email: user.email,
      role,
      ...(code && { code })
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

    if (!user || !user.email) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/google-callback?error=No email found`
      );
    }

    // -----------------------------------------
    // DYNAMIC ROLE RESOLUTION (NO HARDCODING)
    // -----------------------------------------
    const role =
      user._collection === "Farmer"
        ? "farmer"
        : user.role
        ? user.role
        : "buyer";

    // Farmer_code only exists for real farmers
    const code = user.farmer_code || "";

    // -----------------------------------------
    // BUILD JWT
    // -----------------------------------------
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

    const frontendURL =
      process.env.FRONTEND_URL || "https://maziwa-smart.vercel.app";

    // -----------------------------------------
    // FIRST-TIME GOOGLE LOGIN (no password stored)
    // -----------------------------------------
    if (!user.password) {
      return res.redirect(`${frontendURL}/set-password?token=${token}`);
    }

    // -----------------------------------------
    // EXISTING USER → NORMAL FLOW
    // -----------------------------------------
    return res.redirect(
      `${frontendURL}/google-callback?token=${token}&role=${role}&name=${encodeURIComponent(
        payload.name
      )}`
    );
  } catch (err) {
    console.error("googleCallback error:", err);

    const frontendURL =
      process.env.FRONTEND_URL || "https://maziwa-smart.vercel.app";

    return res.redirect(
      `${frontendURL}/google-callback?error=Google login failed`
    );
  }
};

// ------------------------------------------------------------------
// COMPLETE GOOGLE REGISTRATION WITH PASSWORD
// ------------------------------------------------------------------
exports.setPassword = async (req, res) => {
  try {
    const { token, password, phone, location, farmer_code } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: "Missing token or password" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const hashed = await bcrypt.hash(password, 10);

    // ------------------------------------------------------------------
    // FARMER FLOW
    // ------------------------------------------------------------------
    if (decoded.role === "farmer") {
      const farmer = await Farmer.findById(decoded.id);
      if (!farmer)
        return res.status(404).json({ message: "Farmer not found" });

      if (!phone || !farmer_code) {
        return res
          .status(400)
          .json({ message: "Phone and farmer_code required" });
      }

      farmer.password = hashed;
      farmer.phone = phone;
      farmer.farmer_code = farmer_code;
      if (location) farmer.location = location;

      await farmer.save();

      return res.json({
        message: "Farmer registration complete",
        success: true,
      });
    }

    // ------------------------------------------------------------------
    // USER FLOW
    // ------------------------------------------------------------------
    const user = await User.findById(decoded.id);
    if (!user)
      return res.status(404).json({ message: "User not found" });

    user.password = hashed;
    if (phone) user.phone = phone;

    await user.save();

    return res.json({
      message: "Registration complete",
      success: true,
    });
  } catch (err) {
    console.error("setPassword error:", err);

    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }

    return res.status(500).json({
      message: "Server error",
      error: err.message,
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