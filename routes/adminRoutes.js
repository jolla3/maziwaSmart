const express = require("express");
const router = express.Router();
const { verifyToken , authorizeRoles} = require("../middleware/authMiddleware");
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
} = require("../controllers/adminController")

// ✅ Toggle approval (manual override)
// router.patch("/:id", verifyToken, toggleSellerApproval);

router.patch("/:id", verifyToken,authorizeRoles("superadmin"), toggleSellerApproval);

// ✅ Get all pending seller approval requests
router.get("/seller-requests", verifyToken,authorizeRoles("superadmin"), getPendingSellerRequests);

// ✅ Review (approve/reject) seller request
router.patch("/seller-requests/:id", verifyToken,authorizeRoles("superadmin"), reviewSellerRequest);

module.exports = router;
