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
router.get("/extra/trending",   getTrendingListings);
router.get("/",  getMarketListings);
router.get("/:id",  getMarketListingById);

module.exports = router;
