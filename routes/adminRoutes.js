const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const {
  toggleSellerApproval,
  getPendingSellerRequests,
  reviewSellerRequest,
} = require("../controllers/adminController");

// ✅ Toggle seller approval manually
router.patch(
  "/approve-seller/:id",
  verifyToken,
  authorizeRoles("superadmin"),
  toggleSellerApproval
);

// ✅ Get all pending seller requests
router.get(
  "/seller-requests",
  verifyToken,
  authorizeRoles("superadmin"),
  getPendingSellerRequests
);

// ✅ Review (approve/reject) a specific request
router.patch(
  "/seller-requests/:id",
  verifyToken,
  authorizeRoles("superadmin"),
  reviewSellerRequest
);

module.exports = router;
