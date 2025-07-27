
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

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    let user = null;
    let role = null;
    let payload = {};

    // Try in User model (admin, teacher, parent, etc.)
    user = await User.findOne({ email });
    if (user) {
      role = user.role;

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch)
        return res.status(400).json({ message: 'Invalid email or password' });

      payload = {
        userId: user._id,
        role: user.role,
        email: user.email
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1d' });

      return res.status(200).json({
        message: 'Login successful',
        token,
        role,
        user: {
          id: user._id,
          name: user.name || user.username,
          email: user.email,
          role: user.role
        }
      });
    }

    // Else try in Farmer model
    else if ((user = await Farmer.findOne({ email }))) {
      role = 'farmer';

      if (!user.password)
        return res.status(403).json({ message: 'This farmer has no login credentials' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch)
        return res.status(400).json({ message: 'Invalid password' });

      payload = {
        id: user._id,
        email: user.email,
        role,
        code: user.farmer_code
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

      return res.status(200).json({
        message: 'Login successful',
        token,
        role,
        user: {
          id: user._id,
          email: user.email,
          name: user.name
        }
      });
    }

    // Else try in Porter model
    else if ((user = await Porter.findOne({ email }))) {
      role = 'porter';

      if (!user.password)
        return res.status(403).json({ message: 'This porter has no login credentials' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch)
        return res.status(400).json({ message: 'Invalid password' });

      payload = {
        id: user._id,
        email: user.email,
        role,
        code: user.porter_code || ''
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

      return res.status(200).json({
        message: 'Login successful',
        token,
        role,
        user: {
          id: user._id,
          email: user.email,
          name: user.fullname || user.name
        }
      });
    }

    // If no match in any model
    else {
      return res.status(404).json({ message: 'Account not found' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
};
