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

// ✅ Import Cloudinary uploader
const makeUploader = require("../middleware/upload");
const upload = makeUploader("listings"); // uploads go to Cloudinary folder: maziwasmart/listings

// ---------------------------
// Marketplace Routes
// ---------------------------

// 🔹 Public: get all active listings
router.get("/", getListings);

// 🔹 Protected: get user's own listings
router.get("/mylistings", verifyToken, getUserListings);

// 🔹 Public: get a single listing
router.get("/:id", getListingById);

// 🔹 Protected: create new listing (with up to 10 images)
router.post("/", verifyToken, upload.array("images", 10), createListing);

// 🔹 Protected: update existing listing (Cloudinary, match frontend FormData key 'images')
router.put("/:id", verifyToken, upload.array("images", 10), updateListing);

// 🔹 Protected: delete listing
router.delete("/:id", verifyToken, deleteListing);

module.exports = router;
