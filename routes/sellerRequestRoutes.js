const express = require("express");
const router = express.Router();
const {
  requestApproval,
  verifyOtp,
  completeSellerSetup,
} = require("../controllers/sellerRequestController");

// Step 1: Request OTP
router.post("/request-approval", requestApproval);

// Step 2: Verify OTP
router.post("/verify-otp", verifyOtp);

// Step 3: Complete seller setup
router.post("/complete-setup", completeSellerSetup);

module.exports = router;
