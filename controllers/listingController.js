// controllers/listingController.js
const { Listing, Farmer, User ,View} = require("../models/model"); // Assuming Cow is exported as require("../models/model").Cow
const cloudinary = require("cloudinary").v2;
const mongoose = require("mongoose");
// Move config to app startup or config file—trash to repeat here
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

exports.createListing = async (req, res) => {
  try {
    const {
      title,
      animal_type,
      animal_id,
      price,
      description,
      location,
    } = req.body;

    // Parse animal_details safely
    let parsedDetails = {};
    if (req.body.animal_details) {
      try {
        parsedDetails = typeof req.body.animal_details === "string"
          ? JSON.parse(req.body.animal_details)
          : req.body.animal_details;
      } catch (err) {
        return res.status(400).json({ success: false, message: "Invalid animal_details format" });
      }
    }

    // Photos: Fail fast if none
    const uploadedPhotos = req.files?.map(file => file.path) || [];
    if (uploadedPhotos.length === 0) {
      return res.status(400).json({ success: false, message: "At least one photo is required" });
    }

    // Basic validation
    if (!title?.trim() || !animal_type?.trim() || !price) {
      return res.status(400).json({ success: false, message: "Title, animal type, and price are required" });
    }
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({ success: false, message: "Price must be a positive number" });
    }

    const sellerRef = req.user.id;
    const listingData = {
      title: title.trim(),
      animal_type: animal_type.toLowerCase().trim(),
      price: numPrice,
      description: description?.trim() || "",
      location: location?.trim() || "",
      photos: uploadedPhotos,
      status: "available",
      seller: sellerRef,
      animal_details: {},
    };

    const validStages = [
      "calf", "heifer", "cow", "bull_calf", "young_bull", "mature_bull",
      "kid", "doeling", "buckling", "nanny", "buck",
      "lamb", "ewe", "ram",
      "piglet", "gilt", "sow", "boar"
    ];

    if (req.user.role === "farmer") {
      console.log("👨‍🌾 Farmer listing");
      const farmerDoc = await Farmer.findById(req.user.id);
      if (!farmerDoc) {
        return res.status(404).json({ success: false, message: "Farmer not found" });
      }

      if (!animal_id) {
        return res.status(400).json({ success: false, message: "Animal ID required for farmers" });
      }
      const Cow = require("../models/model").Cow; // Assuming exported
      const animal = await Cow.findById(animal_id).populate('breed_id').populate('pregnancy.insemination_id'); // ✅ Fetch animal first
      if (!animal) {
        return res.status(404).json({ success: false, message: "Animal not found" });
      }

      // Ownership check
      if (animal.farmer_id?.toString() !== req.user.id) {
        return res.status(403).json({ success: false, message: "You can only list your own animals" });
      }

      // ✅ Set animal_id after fetch
      listingData.animal_id = animal._id;

      // ✅ Populate breed and sire from breed_id
      const breedData = animal.breed_id || {};
      const inseminationData = animal.pregnancy?.insemination_id || {};

      // ✅ Use animal data directly for accuracy (matches your animal data example)
      listingData.animal_details = {
        age: animal.age || "", // ✅ Use animal.age directly (matches cron format)
        birth_date: animal.birth_date || null,
        breed_name: breedData.breed_name || animal.breed || "Unknown",
        gender: animal.gender || "",
        status: animal.status || "active",
        stage: animal.stage || "",
        lifetime_milk: Number(animal.lifetime_milk) || 0,
        daily_average: Number(animal.daily_average) || 0,
        total_offspring: Number(animal.total_offspring) || 0, // ✅ Use animal.total_offspring
        pregnancy: {
          is_pregnant: animal.pregnancy?.is_pregnant || false,
          expected_due_date: animal.pregnancy?.expected_due_date || null,
          insemination_id: animal.pregnancy?.insemination_id || null,
        },
        bull_code: breedData.bull_code || inseminationData.bull_code || animal.bull_code || "",
        bull_name: breedData.bull_name || inseminationData.bull_name || animal.bull_name || "",
        bull_breed: breedData.bull_breed || inseminationData.bull_breed || "",
      };

      // Merge overrides
      if (Object.keys(parsedDetails).length > 0) {
        listingData.animal_details = { ...listingData.animal_details, ...parsedDetails };
        if (parsedDetails.pregnancy) {
          listingData.animal_details.pregnancy = { ...listingData.animal_details.pregnancy, ...parsedDetails.pregnancy };
        }
      }

      if (!listingData.location) listingData.location = farmerDoc.location || "";

    } else if (req.user.role === "seller") {
      // ... (seller section remains unchanged)
    } else {
      return res.status(403).json({ success: false, message: "Unauthorized role" });
    }

    const listing = new Listing(listingData);
    await listing.save();
    console.log("✅ Listing created:", listing._id);

    return res.status(201).json({
      success: true,
      message: "Listing created successfully",
      listing,
    });
  } catch (err) {
    console.error("❌ Create listing error:", err);
    console.error("Stack:", err.stack);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};
// GET all active listings (Marketplace homepage)
// ---------------------------
exports.getListings = async (req, res) => {
  try {
    const listings = await Listing.find({ status: 'available' })
      .populate({
        path: 'animal_id',
        select: 'cow_name species breed_id mother_id lifetime_milk daily_average total_offspring status stage photos pregnancy offspring_ids birth_date gender',
        populate: [
          { path: 'breed_id', select: 'breed_name' },
          {
            path: 'mother_id',
            select: 'cow_name breed_id lifetime_milk daily_average total_offspring birth_date gender',
            populate: { path: 'breed_id', select: 'breed_name' }
          },
          {
            path: 'offspring_ids',
            select: 'cow_name birth_date stage gender'
          },
          {
            // nested populate the insemination referenced inside pregnancy
            path: 'pregnancy.insemination_id',
            model: 'Insemination',
            select: 'insemination_date method bull_code bull_name bull_breed outcome expected_due_date'
          }
        ]
      })
      .populate('farmer', 'fullname phone email location farmer_code')
      .populate('seller', 'username email role is_approved_seller');

    // convert & normalize: single animal_info field
    const refined = listings.map(l => {
      const obj = l.toObject({ virtuals: true });

      if (obj.animal_id) {
        const cow = obj.animal_id;
        obj.animal_info = {
          id: cow._id,
          name: cow.cow_name || null,
          species: cow.species || null,
          breed: cow.breed_id ? { id: cow.breed_id._id, name: cow.breed_id.breed_name } : null,
          birth_date: cow.birth_date || null,
          gender: cow.gender || null,
          status: cow.status || null,
          stage: cow.stage || null,
          images: listing.photos,
          lifetime_milk: cow.lifetime_milk || 0,
          daily_average: cow.daily_average || 0,
          total_offspring: cow.total_offspring || 0,
          offspring: Array.isArray(cow.offspring_ids) ? cow.offspring_ids.map(o => ({
            id: o._id,
            name: o.cow_name,
            birth_date: o.birth_date,
            stage: o.stage,
            gender: o.gender
          })) : [],
          mother: cow.mother_id ? {
            id: cow.mother_id._id,
            name: cow.mother_id.cow_name || null,
            breed: cow.mother_id.breed_id ? { id: cow.mother_id.breed_id._id, name: cow.mother_id.breed_id.breed_name } : null,
            lifetime_milk: cow.mother_id.lifetime_milk || 0,
            daily_average: cow.mother_id.daily_average || 0,
            total_offspring: cow.mother_id.total_offspring || 0,
            birth_date: cow.mother_id.birth_date || null,
            gender: cow.mother_id.gender || null
          } : null,
          pregnancy: cow.pregnancy ? {
            is_pregnant: !!cow.pregnancy.is_pregnant,
            expected_due_date: cow.pregnancy.expected_due_date || null,
            insemination: cow.pregnancy.insemination_id ? {
              id: cow.pregnancy.insemination_id._id,
              insemination_date: cow.pregnancy.insemination_id.insemination_date,
              method: cow.pregnancy.insemination_id.method,
              bull_code: cow.pregnancy.insemination_id.bull_code,
              bull_name: cow.pregnancy.insemination_id.bull_name,
              bull_breed: cow.pregnancy.insemination_id.bull_breed,
              outcome: cow.pregnancy.insemination_id.outcome,
              expected_due_date: cow.pregnancy.insemination_id.expected_due_date
            } : null
          } : null
        };
      } else if (obj.animal_details) {
        // seller-provided details (already stored on listing)
        obj.animal_info = obj.animal_details;
      } else {
        obj.animal_info = null;
      }

      // cleanup: hide raw fields to reduce frontend branching
      delete obj.animal_details;
      delete obj.animal_id;
      return obj;
    });

    res.status(200).json({ success: true, count: refined.length, listings: refined });
  } catch (err) {
    console.error('Get listings error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch listings', error: err.message });
  }
};

// GET listings for the logged-in user (farmer or seller)
exports.getUserListings = async (req, res) => {
  try {
    const sellerId = req.user && (req.user.id || req.user._id);
    if (!sellerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const listings = await Listing.find({ seller: sellerId })
      .populate({
        path: 'animal_id',
        select: 'cow_name species breed_id mother_id lifetime_milk daily_average total_offspring status stage photos pregnancy offspring_ids birth_date gender',
        populate: [
          { path: 'breed_id', select: 'breed_name' },
          {
            path: 'mother_id',
            select: 'cow_name breed_id lifetime_milk daily_average total_offspring birth_date gender',
            populate: { path: 'breed_id', select: 'breed_name' }
          },
          { path: 'offspring_ids', select: 'cow_name birth_date stage gender' },
          {
            path: 'pregnancy.insemination_id',
            model: 'Insemination',
            select: 'insemination_date method bull_code bull_name bull_breed outcome expected_due_date'
          }
        ]
      })
      .populate('farmer', 'fullname phone email location farmer_code');

    const refined = listings.map(l => {
      const obj = l.toObject({ virtuals: true });

      if (obj.animal_id) {
        const cow = obj.animal_id;
        obj.animal_info = {
          id: cow._id,
          name: cow.cow_name || null,
          species: cow.species || null,
          breed: cow.breed_id ? { id: cow.breed_id._id, name: cow.breed_id.breed_name } : null,
          birth_date: cow.birth_date || null,
          gender: cow.gender || null,
          status: cow.status || null,
          stage: cow.stage || null,
          photos: cow.photos || [],
          lifetime_milk: cow.lifetime_milk || 0,
          daily_average: cow.daily_average || 0,
          total_offspring: cow.total_offspring || 0,
          offspring: Array.isArray(cow.offspring_ids) ? cow.offspring_ids.map(o => ({
            id: o._id,
            name: o.cow_name,
            birth_date: o.birth_date,
            stage: o.stage,
            gender: o.gender
          })) : [],
          mother: cow.mother_id ? {
            id: cow.mother_id._id,
            name: cow.mother_id.cow_name || null,
            breed: cow.mother_id.breed_id ? { id: cow.mother_id.breed_id._id, name: cow.mother_id.breed_id.breed_name } : null,
            lifetime_milk: cow.mother_id.lifetime_milk || 0,
            daily_average: cow.mother_id.daily_average || 0,
            total_offspring: cow.mother_id.total_offspring || 0,
            birth_date: cow.mother_id.birth_date || null,
            gender: cow.mother_id.gender || null
          } : null,
          pregnancy: cow.pregnancy ? {
            is_pregnant: !!cow.pregnancy.is_pregnant,
            expected_due_date: cow.pregnancy.expected_due_date || null,
            insemination: cow.pregnancy.insemination_id ? {
              id: cow.pregnancy.insemination_id._id,
              insemination_date: cow.pregnancy.insemination_id.insemination_date,
              method: cow.pregnancy.insemination_id.method,
              bull_code: cow.pregnancy.insemination_id.bull_code,
              bull_name: cow.pregnancy.insemination_id.bull_name,
              bull_breed: cow.pregnancy.insemination_id.bull_breed,
              outcome: cow.pregnancy.insemination_id.outcome,
              expected_due_date: cow.pregnancy.insemination_id.expected_due_date
            } : null
          } : null
        };
      } else if (obj.animal_details) {
        obj.animal_info = obj.animal_details;
      } else {
        obj.animal_info = null;
      }

      delete obj.animal_details;
      delete obj.animal_id;
      return obj;
    });

    res.status(200).json({ success: true, count: refined.length, listings: refined });
  } catch (err) {
    console.error('Get user listings error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch your listings', error: err.message });
  }
}

// GET single listing by id (same enrichment rules)
exports.getListingById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const l = await Listing.findById(id)
      .populate({
        path: 'animal_id',
        select: 'cow_name species breed_id mother_id lifetime_milk daily_average total_offspring status stage photos pregnancy offspring_ids birth_date gender',
        populate: [
          { path: 'breed_id', select: 'breed_name' },
          {
            path: 'mother_id',
            select: 'cow_name breed_id lifetime_milk daily_average total_offspring birth_date gender',
            populate: { path: 'breed_id', select: 'breed_name' }
          },
          { path: 'offspring_ids', select: 'cow_name birth_date stage gender' },
          {
            path: 'pregnancy.insemination_id',
            model: 'Insemination',
            select: 'insemination_date method bull_code bull_name bull_breed outcome expected_due_date'
          }
        ]
      })
      .populate('farmer', 'fullname phone email location farmer_code')
      .populate('seller', 'username email role is_approved_seller');

    if (!l) return res.status(404).json({ success: false, message: 'Listing not found' });

    const obj = l.toObject({ virtuals: true });
    if (obj.animal_id) {
      const cow = obj.animal_id;
      obj.animal_info = {
        id: cow._id,
        name: cow.cow_name || null,
        species: cow.species || null,
        breed: cow.breed_id ? { id: cow.breed_id._id, name: cow.breed_id.breed_name } : null,
        birth_date: cow.birth_date || null,
        gender: cow.gender || null,
        status: cow.status || null,
        stage: cow.stage || null,
        photos: cow.photos || [],
        lifetime_milk: cow.lifetime_milk || 0,
        daily_average: cow.daily_average || 0,
        total_offspring: cow.total_offspring || 0,
        offspring: Array.isArray(cow.offspring_ids) ? cow.offspring_ids.map(o => ({
          id: o._id,
          name: o.cow_name,
          birth_date: o.birth_date,
          stage: o.stage,
          gender: o.gender
        })) : [],
        mother: cow.mother_id ? {
          id: cow.mother_id._id,
          name: cow.mother_id.cow_name || null,
          breed: cow.mother_id.breed_id ? { id: cow.mother_id.breed_id._id, name: cow.mother_id.breed_id.breed_name } : null,
          lifetime_milk: cow.mother_id.lifetime_milk || 0,
          daily_average: cow.mother_id.daily_average || 0,
          total_offspring: cow.mother_id.total_offspring || 0,
          birth_date: cow.mother_id.birth_date || null,
          gender: cow.mother_id.gender || null
        } : null,
        pregnancy: cow.pregnancy ? {
          is_pregnant: !!cow.pregnancy.is_pregnant,
          expected_due_date: cow.pregnancy.expected_due_date || null,
          insemination: cow.pregnancy.insemination_id ? {
            id: cow.pregnancy.insemination_id._id,
            insemination_date: cow.pregnancy.insemination_id.insemination_date,
            method: cow.pregnancy.insemination_id.method,
            bull_code: cow.pregnancy.insemination_id.bull_code,
            bull_name: cow.pregnancy.insemination_id.bull_name,
            bull_breed: cow.pregnancy.insemination_id.bull_breed,
            outcome: cow.pregnancy.insemination_id.outcome,
            expected_due_date: cow.pregnancy.insemination_id.expected_due_date
          } : null
        } : null
      };
    } else if (obj.animal_details) {
      obj.animal_info = obj.animal_details;
    } else {
      obj.animal_info = null;
    }

    delete obj.animal_details;
    delete obj.animal_id;

    res.status(200).json({ success: true, listing: obj });
  } catch (err) {
    console.error('Get listing by id error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch listing', error: err.message });
  }
};// UPDATE listing (only seller can update)
// ---------------------------
// controllers/listingController.js

// controllers/listingController.js - updateListing function
exports.updateListing = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🟢 PATCH update called for:", id);
    console.log("🟢 req.body:", req.body);
    console.log("🟢 req.files:", req.files?.length || 0);

    const existing = await Listing.findOne({ _id: id, seller: req.user.id });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found or not owned by you",
      });
    }

    const updates = { ...req.body };
    let finalPhotos = [];

    // ✅ Extract existing photos from photos[] array notation
    if (req.body.photos) {
      // FormData sends array items as photos[0], photos[1], etc.
      const photosArray = [];
      Object.keys(req.body).forEach(key => {
        if (key.startsWith('photos[') && req.body[key]) {
          photosArray.push(req.body[key]);
        }
      });

      if (photosArray.length > 0) {
        finalPhotos = photosArray.filter(p => p && typeof p === 'string' && p.startsWith('http'));
      } else {
        // Fallback: try direct photos field
        finalPhotos = Array.isArray(existing.photos) ? existing.photos : [];
      }
    } else {
      // Keep existing photos if none provided
      finalPhotos = Array.isArray(existing.photos) ? existing.photos : [];
    }

    // Add new uploaded photos from Cloudinary
    if (req.files && req.files.length > 0) {
      const newPhotos = req.files.map(f => f.path);
      console.log("✅ New uploads:", newPhotos);
      finalPhotos = [...finalPhotos, ...newPhotos];
    }

    // Remove duplicates and filter out invalid URLs
    updates.photos = [...new Set(finalPhotos)].filter(p =>
      p && typeof p === 'string' && p.startsWith('http')
    );

    console.log("📸 Final photos:", updates.photos);

    // Clean up FormData artifacts
    Object.keys(updates).forEach(key => {
      if (key.startsWith('photos[')) {
        delete updates[key];
      }
    });
    delete updates.existingPhotos;

    const listing = await Listing.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found after update",
      });
    }

    console.log("✅ Listing updated:", listing._id);
    res.status(200).json({
      success: true,
      message: "Listing updated successfully ✅",
      listing,
    });

  } catch (err) {
    console.error("❌ Update listing error:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error during update",
      error: err.message,
    });
  }
};// ---------------------------
// DELETE listing (only seller can delete)
// ---------------------------
// controllers/listingController.js - Updated deleteListing function

exports.deleteListing = async (req, res) => {
  try {
    const { id } = req.params;

    // Extract user ID properly from req.user
    const userId = req.user && (req.user.id || req.user._id || req.user.userId);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - User ID not found"
      });
    }

    console.log('Delete attempt:', { listingId: id, userId, userObject: req.user });

    // Find and delete the listing
    const listing = await Listing.findOneAndDelete({
      _id: id,
      seller: userId
    });

    if (!listing) {
      // Check if listing exists at all
      const exists = await Listing.findById(id);
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: "Listing not found"
        });
      }
      // Listing exists but doesn't belong to this user
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this listing"
      });
    }

    res.status(200).json({
      success: true,
      message: "Listing deleted successfully"
    });
  } catch (err) {
    console.error("Delete listing error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete listing",
      error: err.message
    });
  }
};



exports.registerListingView = async (req, res) => {
  try {
    const listingId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(listingId)) {
      return res.status(400).json({ message: "Invalid listing ID format" });
    }

    const viewerId = req.user.id;
    const viewerRole = req.user.role;
    const viewerSchema = viewerRole === 'farmer' ? 'Farmer' : 'User';

    const listing = await Listing.findById(listingId).select('_id');
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    // Check if view already exists to prevent duplicates
    const existingView = await View.findOne({ listing_id: listingId, viewer_id: viewerId });
    if (existingView) {
      return res.status(204).send(); // Already viewed, no increment
    }

    try {
      await View.create({
        listing_id: listingId,
        viewer_id: viewerId,
        viewer_schema: viewerSchema,
        viewer_role: viewerRole,
      });
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate key error (shouldn't happen with check above, but safety net)
        return res.status(204).send();
      }
      throw err;
    }

    // ✅ NO manual increment here - hook handles it
    return res.status(204).send();

  } catch (err) {
    console.error("❌ registerListingView:", err);
    res.status(500).json({ message: "Failed to register view" });
  }
};

// Other controllers unchanged

exports.getMyListingsViewsSummary = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id; // Handle both _id and id

    console.log('🔍 Getting views summary for user:', userId);

    // Find listings owned by this user
    const userListings = await Listing.find({ seller: userId })
.select('_id title price animal_type images')
      .lean();

    console.log('📦 Found listings:', userListings.length);
    console.log('📦 Listing IDs:', userListings.map(l => l._id));

    if (!userListings.length) {
      return res.status(200).json({
        total_views: 0,
        total_listings: 0,
        by_role: {},
        per_listing: [],
        top_viewed: [],
        recent_views: []
      });
    }

    const listingIds = userListings.map(l => l._id);

    // Debug: Check if views exist for these listings
    const viewCount = await View.countDocuments({ listing_id: { $in: listingIds } });
    console.log('👀 Total views found:', viewCount);

    // Get total views by role
    const roleAgg = await View.aggregate([
      { $match: { listing_id: { $in: listingIds } } },
      { $group: { _id: "$viewer_role", count: { $sum: 1 } } }
    ]);

    console.log('📊 Role aggregation result:', roleAgg);

    const byRole = {};
    let totalViews = 0;
    roleAgg.forEach(group => {
      byRole[group._id] = group.count;
      totalViews += group.count;
    });

    // Get per-listing views with role breakdown
    const perListingAgg = await View.aggregate([
      { $match: { listing_id: { $in: listingIds } } },
      {
        $group: {
          _id: { listing: "$listing_id", role: "$viewer_role" },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.listing",
          total_views: { $sum: "$count" },
          by_role: {
            $push: {
              k: "$_id.role",
              v: "$count"
            }
          }
        }
      },
      {
        $project: {
          total_views: 1,
          by_role: { $arrayToObject: "$by_role" }
        }
      },
      { $sort: { total_views: -1 } }
    ]);

    console.log('📊 Per-listing aggregation result:', perListingAgg);

    // Merge listing details with view data
    const perListing = perListingAgg.map(p => {
      const listing = userListings.find(l => l._id.toString() === p._id.toString());
      return {
        listing_id: p._id,
        title: listing?.title || 'Unknown',
        price: listing?.price || 0,
        category: listing?.category || 'Uncategorized',
        image: listing?.images?.[0] || null,
        total_views: p.total_views,
        by_role: p.by_role
      };
    });

    // Get recent views (last 10) - fix the populate issue
    const recentViews = await View.find({ listing_id: { $in: listingIds } })
      .sort({ viewed_at: -1 })
      .limit(10)
      .lean();

    console.log('🕐 Recent views found:', recentViews.length);

    // Manually add listing titles
    const recentViewsWithTitles = recentViews.map(v => {
      const listing = userListings.find(l => l._id.toString() === v.listing_id.toString());
      return {
        listing_id: v.listing_id,
        listing_title: listing?.title || 'Unknown Listing',
        viewer_role: v.viewer_role,
        viewed_at: v.viewed_at
      };
    });

    const summary = {
      total_views: totalViews,
      total_listings: userListings.length,
      by_role: byRole,
      per_listing: perListing,
      top_viewed: perListing.slice(0, 5),
      recent_views: recentViewsWithTitles
    };

    console.log('✅ Summary response:', JSON.stringify(summary, null, 2));

    res.status(200).json(summary);
  } catch (error) {
    console.error("❌ getMyListingsViewsSummary:", error);
    res.status(500).json({ message: "Failed to fetch my views summary", error: error.message });
  }
};

exports.getListingViews = async (req, res) => {
  try {
    const { id } = req.params;
    const listing = await Listing.findById(id).select('views'); // Only fetch views field
    if (!listing) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }
    const viewsCount = listing.views?.count || 0;
    console.log(`✅ Summary views count for listing ${id}: ${viewsCount}`); // ✅ Debug log
    res.status(200).json({
      success: true,
      views: { count: viewsCount } // ✅ Matches frontend expectation
    });
  } catch (err) {
    console.error("❌ Views summary fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch views" });
  }
};