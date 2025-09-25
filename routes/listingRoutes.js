// routes/listingRoutes.js
const express = require('express');
const router = express.Router();

const {
  createListing,
  getListings,
  getUserListings,
  getListingById,
  updateListing,
  deleteListing
} = require('../controllers/listingController');

const { verifyToken } = require("../middleware/authMiddleware");

// ⬇️ Import upload utility
const makeUploader = require('../utils/upload');
const listingUpload = makeUploader('listings'); // will save under /uploads/listings/

// ---------------------------
// Marketplace Routes
// ---------------------------

// Public: get all active listings
router.get('/', getListings);

// Protected: get your own listings
router.get('/my/listings', verifyToken, getUserListings);

// Public: get a single listing (increments views)
router.get('/:id', getListingById);

// Protected: create new listing (with up to 10 images)
router.post('/', verifyToken, listingUpload.array('images', 10), createListing);

// Protected: update your own listing (optionally update images)
router.put('/:id', verifyToken, listingUpload.array('images', 10), updateListing);

// Protected: delete your own listing
router.delete('/:id', verifyToken, deleteListing);

module.exports = router;
