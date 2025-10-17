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

// ✅ Cloudinary uploader for listings
const upload = makeUploader("listings");

// ---------------------------
// Marketplace Routes
// ---------------------------

// Public: get all active listings
router.get("/", getListings);

// Protected: get your own listings
router.get("/mylistings", verifyToken, getUserListings);

// Public: get a single listing (increments views)
router.get("/:id", getListingById);

// Protected: create new listing (upload up to 10 images)
router.post("/", verifyToken, upload.array("images", 10), createListing);

// ✅ PATCH instead of PUT for partial updates
router.patch("/:id", verifyToken, upload.array("images", 10), updateListing);

// Protected: delete your own listing
router.delete("/:id", verifyToken, deleteListing);

module.exports = router;
