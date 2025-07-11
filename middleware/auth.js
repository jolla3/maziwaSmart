// // ============================
// // Middleware: authMiddleware.js
// // ============================
// const jwt = require('jsonwebtoken');

// // Protect routes
// exports.protect = (req, res, next) => {
//   const authHeader = req.headers.authorization;
//   if (!authHeader || !authHeader.startsWith('Bearer')) {
//     return res.status(401).json({ message: 'Not authorized, no token' });
//   }

//   const token = authHeader.split(' ')[1];
//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = decoded;
//     next();
//   } catch (err) {
//     return res.status(401).json({ message: 'Invalid token' });
//   }
// };

// // Role-based access
// exports.restrictTo = (...roles) => {
//   return (req, res, next) => {
//     if (!roles.includes(req.user.role)) {
//       return res.status(403).json({ message: 'Access denied' });
//     }
//     next();
//   };
// };


// // ============================
// // Route: authRoutes.js
// // ============================
// const express = require('express');
// const router = express.Router();
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const { body, validationResult } = require('express-validator');
// const User = require('../models/User');

// // POST /api/auth/register
// router.post(
//   '/register',
//   [
//     body('username').notEmpty(),
//     body('password').isLength({ min: 6 }),
//     body('role').isIn(['admin', 'porter', 'vet'])
//   ],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { username, password, role } = req.body;
//     try {
//       const hashedPassword = await bcrypt.hash(password, 12);
//       const newUser = await User.create({
//         username,
//         password: hashedPassword,
//         role,
//         code: 'USR-' + Math.floor(Math.random() * 1000000),
//       });
//       res.status(201).json({ message: 'User registered', user: newUser });
//     } catch (err) {
//       res.status(500).json({ message: 'Registration failed', error: err });
//     }
//   }
// );

// // POST /api/auth/login
// router.post(
//   '/login',
//   [body('username').notEmpty(), body('password').notEmpty()],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { username, password } = req.body;
//     try {
//       const user = await User.findOne({ username });
//       if (!user) return res.status(400).json({ message: 'Invalid credentials' });

//       const match = await bcrypt.compare(password, user.password);
//       if (!match) return res.status(400).json({ message: 'Invalid credentials' });

//       const token = jwt.sign(
//         { id: user._id, role: user.role, code: user.code },
//         process.env.JWT_SECRET,
//         { expiresIn: '1d' }
//       );

//       res.status(200).json({ token, user });
//     } catch (err) {
//       res.status(500).json({ message: 'Login failed', error: err });
//     }
//   }
// );

// module.exports = router;


// ============================
// FILE: middleware/authMiddleware.js
// ============================
const jwt = require('jsonwebtoken');

// Verifies token and attaches user to request
exports.protect = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Restricts access based on user role (admin, porter, vet)
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  };
};


// ============================
// FILE: middleware/validateInput.js
// ============================
const { validationResult } = require('express-validator');

exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};


// ============================
// FILE: middleware/rateLimiter.js
// ============================
const rateLimit = require('express-rate-limit');

exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.',
});


// ============================
// FILE: middleware/securityHeaders.js
// ============================
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

module.exports = [
  helmet(),               // Sets secure HTTP headers
  xss(),                  // Sanitizes user input against XSS
  mongoSanitize(),        // Prevents NoSQL injections
  hpp()                   // Prevents HTTP parameter pollution
];


// ============================
// FILE: middleware/corsOptions.js
// ============================
const cors = require('cors');

const allowedOrigins = ['http://localhost:3000'];

exports.corsOptions = cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
});
