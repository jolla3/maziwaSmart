// routes/authRoutes.js
const express = require("express");
const passport = require("passport");
const router = express.Router();
const { googleCallback } = require("../controllers/authController");

const {
  registerAdmin,
  login,
  registerSeller,
  
  registerFarmer,
} = require("../controllers/authController");
// const { toggleSellerApproval } = require("../controllers/adminController")
const { verifyToken } = require("../middleware/authMiddleware");

// ----------------------------
// NORMAL AUTH ROUTES
// ----------------------------
router.post("/register", registerAdmin);
router.post("/register/seller", registerSeller); // Register seller (pending approval)
router.post('/register/farmer', registerFarmer);     // Admin register
router.post("/login", login);                // Login (admin, farmer, porter, etc.)
router.post("/set-password", require("../controllers/authController").setPassword);


// Start Google OAuth — frontend should call /api/userAuth/google?role=farmer or ?role=buyer
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

// Callback - if passport fails, send user to frontend's google-callback with an error
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL || "https://maziwa-smart.vercel.app"}/google-callback?error=Google+auth+failed`,
    session: false,
    passReqToCallback: false,
  }),
  googleCallback
);

module.exports = router;
