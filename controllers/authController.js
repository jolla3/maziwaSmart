
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

exports.loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });

    const token = jwt.sign(
      { userId: user._id, role:user.role},
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed' });
  }
};




// lkjhfgdxzsxcvnmn,jbvhcf vbn

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Try to find user in Farmers
    let user = await Farmer.findOne({ email });
    let role = 'farmer';

    // If not found, check in Porters
    if (!user) {
      user = await Porter.findOne({ email });
      if (user) role = 'porter';
    }

    // If still not found
    if (!user) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Check if password exists
    if (!user.password) {
      return res.status(403).json({ message: `This ${role} has no login credentials` });
    }

    // Validate password
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    // Prepare token payload
    // Prepare token payload
const payload = {
  id: user._id,
  email: user.email,
  role,
  farmer_code:user.farmer_code
}

if (role === 'farmer') {
  payload.code = user.farmer_code;   // ✅ Standard key: code
} else if (role === 'porter') {
  payload.code = user.porter_code || '';  // If exists
}


    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(200).json({
      message: 'Login successful',
      token,
      role,
      user: {
        id: user._id,
        email: user.email,
        name: user.name || user.fullname || ''
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
};