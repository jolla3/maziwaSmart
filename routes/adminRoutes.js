const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const {
  toggleSellerApproval,
  getPendingSellerRequests,
  reviewSellerRequest
} = require("../controllers/adminController");

// ✅ Toggle approval (manual override)
router.patch("/approve-seller/:id", verifyToken, toggleSellerApproval);

// ✅ Get all pending seller approval requests
router.get("/seller-requests", verifyToken, getPendingSellerRequests);

// ✅ Review (approve/reject) seller request
router.patch("/seller-requests/:id", verifyToken, reviewSellerRequest);

module.exports = router;
