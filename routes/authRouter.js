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
// const { toggleSellerApproval } = require("../controllers/adminController");
const { verifyToken } = require("../middleware/authMiddleware");

// ----------------------------
// NORMAL AUTH ROUTES
// ----------------------------
router.post("/register", registerAdmin);
router.post("/register/seller", registerSeller); // Register seller (pending approval)
router.post('/register/farmer', registerFarmer);     // Admin register
router.post("/login", login);                // Login (admin, farmer, porter, etc.)
router.post("/set-password", require("../controllers/authController").setPassword);


// Google OAuth
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.FRONTEND_URL}/google-login?error=Google login failed`,
    session: false,
  }),
  googleCallback
);

module.exports = router;
