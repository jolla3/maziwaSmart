const express = require("express");
const router = express.Router();
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const {
  toggleSellerApproval,
  getPendingSellerRequests,
  reviewSellerRequest,
} = require("../controllers/adminController");

// ✅ TEST ROUTE - Check if route is working
router.get("/test", (req, res) => {
  res.json({ 
    success: true, 
    message: "Admin route is working!",
    timestamp: new Date()
  });
});

// ✅ TEST ROUTE - Check auth
router.get("/test-auth", verifyToken, (req, res) => {
  res.json({ 
    success: true, 
    message: "Auth is working!",
    user: {
      id: req.user.id,
      role: req.user.role
    }
  });
});

// ✅ Toggle seller approval manually (admin or superadmin)
router.patch(
  "/approve-seller/:id",
  verifyToken,
  authorizeRoles("admin", "superadmin"),
  toggleSellerApproval
);

// ✅ Get all pending seller requests (admin or superadmin)
router.get(
  "/seller-requests",
  verifyToken,
  authorizeRoles("admin", "superadmin"),
  getPendingSellerRequests
);

// ✅ Review (approve/reject) a specific request (admin or superadmin)
router.patch(
  "/seller-requests/:id",
  verifyToken,
  authorizeRoles("admin", "superadmin"),
  reviewSellerRequest
);

module.exports = router;