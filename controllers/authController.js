// ============================
// FILE: controllers/authController.js
// ============================
const bcrypt = require("bcrypt");
const { User, Porter, Farmer } = require("../models/model");
const jwt = require("jsonwebtoken");

// ----------------------------
// REGISTER ADMIN
// ----------------------------
exports.registerAdmin = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role,
    });

    await newUser.save();

    res.status(201).json({
      message: `User ${newUser.username} registered successfully, You can now login`,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Registration failed", error: err });
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

    res.status(200).json({
      success: true,
      message: "✅ Google login successful",
      token,
      role,
      user: {
        id: user._id,
        name: payload.name,
        email: user.email,
        role,
        code,
      },
    });
  } catch (err) {
    console.error("❌ Google callback error:", err);
    res.status(500).json({ success: false, message: "Google login failed", error: err.message });
  }
};
