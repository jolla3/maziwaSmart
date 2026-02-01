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
  registerListingView,
  getListingViewsSummary,
  getListingViews,
  getMyListingsViewsSummary,
} = require("../controllers/listingController");

const { verifyToken } = require("../middleware/authMiddleware");
const makeUploader = require("../middleware/upload");

const upload = makeUploader("listings");

// ---------------------------
// IMPORTANT: Specific routes BEFORE dynamic :id routes!
// ---------------------------

// Public: get all active listings
router.get("/", getListings);

// Protected: get your own listings
router.get("/mylistings", verifyToken, getUserListings);

// VIEWS ROUTES - Must come BEFORE /:id route!
router.post("/views/:id", verifyToken, registerListingView);
router.get("/my-summary", verifyToken, getMyListingsViewsSummary);
router.get("/summary/:id", verifyToken, getListingViews);

// Protected: create new listing
router.post("/", verifyToken, upload.array("images", 10), createListing);

// Dynamic routes LAST (will catch anything not matched above)
router.get("/:id", getListingById);
router.patch("/:id", verifyToken, upload.array("images", 10), updateListing);
router.delete("/:id", verifyToken, deleteListing);

module.exports = router;