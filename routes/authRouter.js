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
const { verifyToken } = require("../middleware/authMiddleware");
const { logEvent } = require("../utils/eventLogger");  // ← THIS IS THE KEY

// ----------------------------
// NORMAL AUTH ROUTES
// ----------------------------
router.post("/register", registerAdmin);
router.post("/register/seller", registerSeller);
router.post('/register/farmer', registerFarmer);
router.post("/login", login);
router.post("/set-password", require("../controllers/authController").setPassword);

// ✅ START GOOGLE OAUTH - capture role and pass via state
router.get("/google", (req, res, next) => {
  const role = req.query.role 
  
  // Pass role through OAuth state parameter
  passport.authenticate("google",  {
    scope: ["profile", "email"],
    session: false,
    state: JSON.stringify({ role }) // encode role in state
  })(req, res, next);
});

// ✅ CALLBACK - extract role from state
router.get(
  "/google/callback", 
  (req, res, next) => {
    passport.authenticate("google", {
      failureRedirect: `${process.env.FRONTEND_URL || "https://maziwa-smart.vercel.app"}/google-callback?error=Google+auth+failed`,
      session: false,
    })(req, res, next);
  },
  googleCallback
);

module.exports = router;