// const jwt = require('jsonwebtoken');
// const JWT_SECRETe= process.env.JWT_SECRET

// exports.verifyToken = (req, res, next) => {
//   const authHeader = req.headers.authorization;
//   if (!authHeader || !authHeader.startsWith('Bearer '))
//     return res.status(401).json({ message: 'Unauthorized' });

//   const token = authHeader.split(' ')[1];
//   try {
//     const decoded = jwt.verify(token, JWT_SECRETe);
//     req.user = decoded
    
//     req.user = {
//   userId: decoded.id,
//   email: decoded.email,
//   role: decoded.role,  
//   // role:decoded.role ,// or type if you're using 'type' in the token

//   code: porter.farmer_code || porter.porter_.id
// }

//     next();
//   } catch (err) {
//     console.error(err);
//     res.status(403).json({ message: 'Invalid token' });
//   }
// }
// middleware/authMiddleware.js
// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const logger = require("../utils/logger"); // assuming you have this for proper logging

exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];

  if (!token) {
    logger.warn(`No token - IP: ${req.ip} Path: ${req.originalUrl}`);
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { 
      id: decoded.id, 
      email: decoded.email, 
      role: decoded.role, 
      code: decoded.code || null 
    };
    next();
  } catch (err) {
    logger.error(`Token fail - IP: ${req.ip} Error: ${err.message}`);
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(403).json({ message: "Invalid token" });
    }
    res.status(500).json({ message: "Auth error" });
  }
};

exports.authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      logger.warn(`No user after token - IP: ${req.ip}`);
      return res.status(403).json({ message: "Access denied: No user" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(`Role denied: ${req.user.role} - User: ${req.user.id} Path: ${req.originalUrl}`);
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
};

// Socket version unchanged - it's the only decent part
exports.verifySocketAuth = (socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];
  if (!token) return next(new Error("No token"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
    logger.error(`Socket token fail - IP: ${socket.handshake.address} Error: ${err.message}`);
    next(new Error("Auth error"));
  }
};