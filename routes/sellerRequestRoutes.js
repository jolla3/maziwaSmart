const express = require("express");
const router = express.Router();
const {
  requestApproval,
  verifyOtp,
  completeSellerSetup,
} = require("../controllers/sellerRequestController");

const { verifyToken ,authorizeRoles} = require('../middleware/authMiddleware');

// Step 1: Request OTP
router.post("/request-approval", verifyToken,authorizeRoles("superadmin"),  requestApproval);

// Step 2: Verify OTP
router.post("/verify-otp",verifyToken, verifyOtp);

// Step 3: Complete seller setup
router.post("/complete-setup", verifyToken, completeSellerSetup);

module.exports = router;

