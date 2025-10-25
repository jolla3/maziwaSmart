const express = require("express");
const router = express.Router();
const { verifyToken , authorizeRoles} = require("../middleware/authMiddleware");
const {
  toggleSellerApproval,
  getPendingSellerRequests,
  reviewSellerRequest
} = require("../controllers/adminController")

// ✅ Toggle approval (manual override)
// router.patch("/:id", verifyToken, toggleSellerApproval);

router.patch("/:id", verifyToken,authorizeRoles("superadmin"), toggleSellerApproval);

// ✅ Get all pending seller approval requests
router.get("/seller-requests", verifyToken,authorizeRoles("superadmin"), getPendingSellerRequests);

// ✅ Review (approve/reject) seller request
router.patch("/seller-requests/:id", verifyToken,authorizeRoles("superadmin"), reviewSellerRequest);

module.exports = router;
