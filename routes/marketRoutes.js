// routes/marketRoutes.js
const express = require("express");
const router = express.Router();

const {
  getMarketListings,
  getMarketListingById,
  getTrendingListings,
} = require("../controllers/marketController");

const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');



// ---------------------------
// Market Routes
// ---------------------------

// Public: fetch listings with filters + sorting
router.get("/",verifyToken, getMarketListings);

// Public: fetch single listing with details
router.get("/:id",verifyToken, getMarketListingById);

// Public: trending listings
router.get("/extra/trending", verifyToken,getTrendingListings);

module.exports = router;
