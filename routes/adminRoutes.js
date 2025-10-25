const express = require("express");
const router = express.Router();
const { verifyToken , authorizeRoles} = require("../middleware/authMiddleware");
const {
  toggleSellerApproval,
  getPendingSellerRequests,
  reviewSellerRequest
} = require("../controllers/adminController");

// ✅ Toggle approval (manual override)
router.patch("/approve-seller/:id", verifyToken,authorizeRoles("superadmin"), toggleSellerApproval);

// ✅ Get all pending seller approval requests
router.get("/seller-requests", verifyTokeauthorizeRoles("superadmin"), getPendingSellerRequests);

// ✅ Review (approve/reject) seller request
router.patch("/seller-requests/:id", verifyTokeauthorizeRoles("superadmin"), reviewSellerRequest);

module.exports = router;
