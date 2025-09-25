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
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    let user = null;
    let role = "";
    let code = "";

    // 1. Check in Admin Users
    user = await User.findOne({ email });
    if (user) {
      role = user.role;
      code = "";
    } else {
      // 2. Farmers
      user = await Farmer.findOne({ email });
      if (user) {
        role = "farmer";
        code = user.farmer_code;
      } else {
        // 3. Porters
        user = await Porter.findOne({ email });
        if (user) {
          role = "porter";
          code = user.porter_code || "";
        }
      }
    }

    if (!user) {
      return res.json({ message: "Account not found" });
    }

    if (!user.password) {
      return res.json({ message: `This ${role} has no login credentials` });
    }

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) {
      return res.json({ message: "Invalid password" });
    }

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

    res.status(200).json({
      message: "Login successful",
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
    console.error(error);
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

// ----------------------------
// REGISTER SELLER
// ----------------------------
exports.registerSeller = async (req, res) => {
  try {
    const { fullname, phone, email, password, location } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const seller = new User({
      fullname,
      phone,
      email,
      password: hashedPassword,
      role: "seller",
      approved: false, // superadmin must approve
      location,
    });

    await seller.save();

    res.status(201).json({
      message: "✅ Seller registered. Awaiting approval by admin.",
      seller: {
        id: seller._id,
        fullname: seller.fullname,
        approved: seller.approved,
      },
    });
  } catch (err) {
    console.error("❌ Register seller error:", err);
    res.status(500).json({ message: "Server error" });
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
    let role = "buyer"; // default fallback
    let code = "";

    if (!user) {
      // ✅ If no user found, check if this email belongs to a farmer
      let farmer = await Farmer.findOne({ email });

      if (farmer) {
        user = farmer;
        role = "farmer";
        code = farmer.farmer_code;
      } else {
        // ✅ New Google user → default create as buyer in User
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
      role = user.role;
    }

    // Build token payload
    const payload = {
      id: user._id,
      name: user.username || user.fullname || displayName,
      email: user.email,
      role,
      code,
    };

    // Create JWT
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

    // No frontend yet? Just return JSON
    res.json({
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
    console.error("Google callback error:", err);
    res.status(500).json({ success: false, message: "Google login failed" });
  }
};