
// ============================
// FILE: controllers/authController.js
// ============================
const bcrypt = require('bcrypt')
const { User, Porter,Farmer } = require('../models/model') // Make sure index.js exports User
const jwt = require('jsonwebtoken')


exports.registerAdmin = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role:'admin'
    });

    await newUser.save();

    res.status(201).json({
      message: `User ${newUser.username} registered successfully, You can now login`,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        // code: newUser.code
      }
    });
  } catch (err) {
    if (err.code === 11000) {
      const duplicateField = Object.keys(err.keyPattern)[0];
      return res.status(400).json({
        message: `${duplicateField.charAt(0).toUpperCase() + duplicateField.slice(1)} already exists`
      });
    }

    console.error(err);
    res.status(500).json({ message: 'Registration failed', error: err });
  }
};
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    let user = null;
    let role = '';
    let code = '';

    // 1. Check in Admin Users
    user = await User.findOne({ email });
    if (user) {
      role = user.role;
      code = ''; // Admins may not have codes
    } else {
      // 2. Check in Farmers
      user = await Farmer.findOne({ email });
      if (user) {
        role = 'farmer';
        code = user.farmer_code;
      } else {
        // 3. Check in Porters
        user = await Porter.findOne({ email });
        if (user) {
          role = 'porter';
          code = user.porter_code || '';
        }
      }
    }

    // Not found in any model
    if (!user) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Missing password
    if (!user.password) {
      return res.status(403).json({ message: `This ${role} has no login credentials` });
    }

    // Password check
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Token payload
    const payload = {
      id: user._id,
      email: user.email,
      role,
      code,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Response
    res.status(200).json({
      message: 'Login successful',
      token,
      role,
      user: {
        id: user._id,
        name: user.name || user.fullname || user.username || '',
        email: user.email,
        role,
        code,
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
};
