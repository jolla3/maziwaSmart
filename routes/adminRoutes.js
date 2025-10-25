const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const {
  toggleSellerApproval,
  getPendingSellerRequests,
  reviewSellerRequest,
} = require("../controllers/adminController");

// ✅ Toggle seller approval manually (admin or superadmin)
router.patch(
  "/approve-seller/:id",
  verifyToken,
  authorizeRoles("admin", "superadmin"), // ✅ Allow both
  toggleSellerApproval
);

// ✅ Get all pending seller requests (admin or superadmin)
router.get(
  "/seller-requests",
  verifyToken,
  authorizeRoles("admin", "superadmin"), // ✅ Allow both
  getPendingSellerRequests
);

// ✅ Review (approve/reject) a specific request (admin or superadmin)
router.patch(
  "/seller-requests/:id",
  verifyToken,
  authorizeRoles("admin", "superadmin"), // ✅ Allow both
  reviewSellerRequest
);

module.exports = router;