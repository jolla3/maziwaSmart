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
const jwt = require("jsonwebtoken");

// ✅ Middleware for Express routes
exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // attach user payload
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired. Please log in again." });
    }
    return res.status(401).json({ message: "Invalid token", error: err.message });
  }
};

// ✅ Middleware for Socket.io connections
exports.verifySocketAuth = (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(" ")[1];
    if (!token) return next(new Error("Authentication error: No token provided"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded; // attach user data
    next();
  } catch (err) {
    console.error("❌ Socket auth failed:", err.message);
    next(new Error("Authentication error"));
  }
};

exports.authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied: Insufficient permissions" });
    }
    next();
  };
};


