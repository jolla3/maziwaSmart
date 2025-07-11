const bcrypt = require('bcrypt')
const { User } = require('../models/model') // Make sure index.js exports User
const jwt = require('jsonwebtoken')


// // Helper to auto-generate code if not supplied
// const generateCode = (role) => {
//   const prefix = role.substring(0, 3).toUpperCase();
//   return `${prefix}-${Date.now().toString().slice(-6)}`;
// };

// Helper to auto-generate code like ADM-381, FAR-9321
const generateCode = (role) => {
  const prefix = role.slice(0, 3).toUpperCase();
  const digits = Math.floor(100 + Math.random() * 9000); // 3 to 4 digit code
  return `${prefix}-${digits}`;
};



exports.registerUser = async (req, res) => {
  try {
    const { username, email, password, role, code } = req.body;

    // Check for existing user
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'Email already exists' });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role,
      code: code || generateCode(role)
    });

    await newUser.save();
    res.status(201).json({ message: 'User registered successfully', user: {
      id: newUser._id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      code: newUser.code
      
    }});
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Registration failed' });
  }
};


// login route
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Check if user exists
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid email or password' });

    // 2. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid email or password' });

    // 3. Generate token
    const token = jwt.sign(
      { userId: user._id, role: user.role, code: user.code },
      process.env.JWT_SECRET ,
      { expiresIn: '2h' }
    );

    // 4. Return success
    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        code: user.code
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed' });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.status(200).json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to get users' });
  }
};