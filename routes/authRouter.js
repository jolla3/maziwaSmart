

// const express = require('express')
// const router = express.Router()
// const { verifyToken }  = require('../middleware/authMiddleware')
// const loginController = require('../controllers/authController')


// router.post('/register', loginController.registerUser);
// router.post('/login', loginController.loginUser);
// router.get('/get', verifyToken, authorizeRoles('admin'), loginController.getUsers);
// router.get('/me', verifyToken, loginController.getMyProfile);


// ============================
// FILE: routes/authRoutes.js
// ============================
// const express = require('express');
// const router = express.Router();

// const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
// const loginController = require('../controllers/authController');

// router.post('/register',verifyToken, loginController.registerUser);
// router.post('/login',verifyToken, loginController.loginUser);
// router.get('/get', verifyToken, authorizeRoles('admin'),loginController.getUsers);
// router.get('/me', verifyToken, loginController.getMyProfile);


// // module.exports = router;
// const express = require('express');
// const router = express.Router();

// const loginController = require('../controllers/authController');
// const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// // Public routes
// // router./('/register', loginController.registerUser);

// router.post('/register', loginController.registerAdmin);
// router.post('/login', loginController.login);
// // router.post('/loginUsers', loginController.loginUser);




// module.exports = router
// ============================
// FILE: routes/authRoutes.js
// ============================
const express = require("express");
const passport = require("passport");
const router = express.Router();

const {
  registerAdmin,
  login,
  registerSeller,
  googleCallback,
} = require("../controllers/authController");
const { toggleSellerApproval } = require("../controllers/adminController");
const { verifyToken } = require("../middleware/authMiddleware");

// ----------------------------
// NORMAL AUTH ROUTES
// ----------------------------
router.post("/register", registerAdmin);     // Admin register
router.post("/login", login);                // Login (admin, farmer, porter, etc.)
router.post("/seller/register", registerSeller); // Register seller (pending approval)

// Only superadmin should access
router.patch("/:id", verifyToken, toggleSellerApproval);


// ----------------------------
// GOOGLE AUTH ROUTES
// ----------------------------
// Step 1: Redirect user to Google
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Step 2: Callback after Google login
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  googleCallback   // Controller handles JWT + response
);

module.exports = router;
