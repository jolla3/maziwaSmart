const express = require("express");
const router = express.Router();
const { toggleSellerApproval } = require("../controllers/adminController");
const { verifyToken } = require("../middleware/authMiddleware");

// Only superadmin should access
router.put("/approve-seller/:sellerId", verifyToken, toggleSellerApproval);

module.exports = router;
