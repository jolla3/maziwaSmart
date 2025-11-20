// routes/listingRoutes.js
const express = require("express");
const router = express.Router();
const {
  createListing,
  getListings,
  getUserListings,
  getListingById,
  updateListing,
  deleteListing,
} = require("../controllers/listingController");

const { verifyToken } = require("../middleware/authMiddleware");
const makeUploader = require("../middleware/upload");
const { logEvent } = require("../utils/eventLogger");  // ← THIS IS THE KEY

// ✅ Cloudinary uploader for listings
const upload = makeUploader("listings");

// ---------------------------
// Marketplace Routes
// ---------------------------

// Public: get all active listings
router.get("/", logEvent ,getListings);

// Protected: get your own listings
router.get("/mylistings", logEvent ,verifyToken, getUserListings);

// Public: get a single listing (increments views)
router.get("/:id", logEvent , getListingById);

// Protected: create new listing (upload up to 10 images)
router.post("/", verifyToken, logEvent , upload.array("images", 10), createListing);

// ✅ PATCH instead of PUT for partial updates
router.patch("/:id", verifyToken,logEvent , upload.array("images", 10), updateListing);

// Protected: delete your own listing
router.delete("/:id", verifyToken,logEvent , deleteListing);

module.exports = router;
