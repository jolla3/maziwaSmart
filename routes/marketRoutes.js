// routes/marketRoutes.js
const express = require("express");
const router = express.Router();

const {
  getMarketListings,
  getMarketListingById,
  getTrendingListings,
} = require("../controllers/marketController");

const {  authorizeRoles , verifyToken} = require('../middleware/authMiddleware');



// ---------------------------
// Market Routes
// ---------------------------

// controllers same, no change
router.get("/extra/trending", verifyToken,  getTrendingListings);
router.get("/", verifyToken, getMarketListings);
router.get("/:id", verifyToken, getMarketListingById);

module.exports = router;
