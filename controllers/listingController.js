// controllers/listingController.js
const { Listing, Farmer, User, Cow } = require('../models/model');

// ---------------------------
// CREATE a new listing
// ---------------------------
// CREATE a new listing
// CREATE a new listing
exports.createListing = async (req, res) => {
  try {
    const {
      title,
      animal_type,
      animal_id,
      price,
      description,
      photos,
      location,
      farmer_id
    } = req.body;

    if (!title || !animal_type || !price) {
      return res.status(400).json({
        success: false,
        message: "Title, animal type, and price are required"
      });
    }

    let farmerRef = null;
    let sellerRef = req.user.id;

    // ✅ Farmer case
    if (req.user.role === "farmer") {
      const farmerDoc = await Farmer.findById(req.user.id);
      if (!farmerDoc) {
        return res
          .status(404)
          .json({ success: false, message: "Farmer not found" });
      }

      // Validate animal if provided
      if (animal_id) {
        const linkedAnimal = await Cow.findById(animal_id);
        if (!linkedAnimal) {
          return res
            .status(404)
            .json({ success: false, message: "Animal not found" });
        }
      }

      farmerRef = farmerDoc._id;
      // keep location from farmer if not provided
      if (!location) location = farmerDoc.location;
    }

    // ✅ Seller case
    else if (req.user.role === "seller") {
      const sellerDoc = await User.findById(req.user.id);
      if (!sellerDoc || !sellerDoc.is_approved_seller) {
        return res.status(403).json({
          success: false,
          message: "Seller not approved by SuperAdmin"
        });
      }

      farmerRef = farmer_id || null; // external sellers may optionally link a farmer
    }

    // ❌ Other roles cannot list
    else {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to create listings"
      });
    }

    // ✅ Shared listing creation
    const listing = new Listing({
      title,
      animal_type,
      animal_id: req.user.role === "farmer" ? animal_id : null,
      farmer: farmerRef,
      seller: sellerRef,
      price,
      description: description || "",
      photos: photos || [],
      location: location || ""
    });

    await listing.save();

    return res.status(201).json({
      success: true,
      message: "Listing created successfully",
      listing
    });
  } catch (err) {
    console.error("Create listing error:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};
// ---------------------------
// GET all active listings (Marketplace homepage)
// ---------------------------
exports.getListings = async (req, res) => {
  try {
    const listings = await Listing.find({ status: 'available' })
      .populate("animal_id", "cow_name species breed_id")
      .populate("farmer", "fullname phone email")
      .populate("seller", "username email role");

    res.status(200).json({ success: true, count: listings.length, listings });
  } catch (err) {
    console.error("Get listings error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch listings" });
  }
};

// ---------------------------
// GET listings for the logged-in user (farmer or seller)
// ---------------------------
exports.getUserListings = async (req, res) => {
  try {
    const listings = await Listing.find({ seller: req.user._id })
      .populate("animal_id", "cow_name species breed_id")
      .populate("farmer", "fullname phone email");

    res.status(200).json({ success: true, count: listings.length, listings });
  } catch (err) {
    console.error("Get user listings error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch your listings" });
  }
};

// ---------------------------
// GET single listing by ID + increment views
// ---------------------------
exports.getListingById = async (req, res) => {
  try {
    const { id } = req.params;

    const listing = await Listing.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } }, // increment views
      { new: true }
    )
      .populate("animal_id", "cow_name species breed_id")
      .populate("farmer", "fullname phone email")
      .populate("seller", "username email role");

    if (!listing) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    res.status(200).json({ success: true, listing });
  } catch (err) {
    console.error("Get listing error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch listing" });
  }
};

// ---------------------------
// UPDATE listing (only seller can update)
// ---------------------------
exports.updateListing = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const listing = await Listing.findOneAndUpdate(
      { _id: id, seller: req.user._id },
      updates,
      { new: true }
    );

    if (!listing) return res.status(404).json({ success: false, message: "Listing not found or not yours" });

    res.status(200).json({ success: true, message: "Listing updated", listing });
  } catch (err) {
    console.error("Update listing error:", err);
    res.status(500).json({ success: false, message: "Failed to update listing" });
  }
};

// ---------------------------
// DELETE listing (only seller can delete)
// ---------------------------
exports.deleteListing = async (req, res) => {
  try {
    const { id } = req.params;

    const listing = await Listing.findOneAndDelete({ _id: id, seller: req.user._id });
    if (!listing) return res.status(404).json({ success: false, message: "Listing not found or not yours" });

    res.status(200).json({ success: true, message: "Listing deleted successfully" });
  } catch (err) {
    console.error("Delete listing error:", err);
    res.status(500).json({ success: false, message: "Failed to delete listing" });
  }
};
