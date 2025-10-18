// controllers/listingController.js
const { Listing, Farmer, Cow, User } = require("../models/model");
const cloudinary = require("cloudinary").v2;

// ✅ Ensure Cloudinary is configured globally
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});
// ---------------------------
// CREATE a new listing
// ---------------------------

// controllers/listingController.js
exports.createListing = async (req, res) => {
  try {
    console.log("🟢 [CREATE LISTING] Endpoint hit");
    console.log("📦 Body keys:", Object.keys(req.body));
    console.log("📦 Body:", req.body);
    console.log("📸 Files:", req.files?.length || 0);

    const {
      title,
      animal_type,
      animal_id,
      price,
      description,
      location,
    } = req.body;

    // ✅ Parse animal_details if it exists
    let parsedDetails = {};
    if (req.body.animal_details) {
      try {
        parsedDetails = typeof req.body.animal_details === "string" 
          ? JSON.parse(req.body.animal_details)
          : req.body.animal_details;
      } catch (err) {
        console.error("Failed to parse animal_details:", err);
        return res.status(400).json({
          success: false,
          message: "Invalid animal_details format",
        });
      }
    }

    // ✅ Get Cloudinary URLs
    let uploadedPhotos = [];
    if (req.files && req.files.length > 0) {
      uploadedPhotos = req.files.map(f => f.path);
      console.log("✅ Uploaded photos:", uploadedPhotos);
    }

    if (!title || !animal_type || !price) {
      return res.status(400).json({
        success: false,
        message: "Title, animal type, and price are required",
      });
    }

    if (uploadedPhotos.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one photo is required",
      });
    }

    const sellerRef = req.user.id;

    const listingData = {
      title,
      animal_type,
      price: Number(price),
      description: description || "",
      location: location || "",
      photos: uploadedPhotos,
      status: "available",
      seller: sellerRef,
    };

    const validStages = [
      "calf", "heifer", "cow",
      "bull_calf", "young_bull", "mature_bull",
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

      listingData.farmer = farmerDoc._id;

      if (animal_id) {
        const animal = await Cow.findById(animal_id);
        if (!animal) {
          return res.status(404).json({ success: false, message: "Animal not found" });
        }
        listingData.animal_id = animal._id;
      }

      if (!listingData.location) {
        listingData.location = farmerDoc.location || "";
      }

    } else if (req.user.role === "seller") {
      console.log("🧑‍💼 Seller listing");

      const sellerDoc = await User.findById(sellerRef);
      if (!sellerDoc) {
        return res.status(404).json({ success: false, message: "Seller not found" });
      }

      if (!sellerDoc.is_approved_seller) {
        return res.status(403).json({
          success: false,
          message: "Seller not approved",
        });
      }

      if (!parsedDetails.age || !parsedDetails.breed_name) {
        return res.status(400).json({
          success: false,
          message: "Age and breed_name are required for sellers",
        });
      }

      let cleanStage = null;
      if (parsedDetails.stage && validStages.includes(parsedDetails.stage.toLowerCase())) {
        cleanStage = parsedDetails.stage.toLowerCase();
      } else {
        const defaults = {
          cow: "cow",
          bull: "mature_bull",
          goat: "nanny",
          sheep: "ewe",
          pig: "sow",
        };
        cleanStage = defaults[animal_type] || null;
      }

      listingData.animal_details = {
        age: parsedDetails.age,
        breed_name: parsedDetails.breed_name,
        gender: parsedDetails.gender || "",
        bull_code: parsedDetails.bull_code || "",
        bull_name: parsedDetails.bull_name || "",
        bull_breed: parsedDetails.bull_breed || "",
        status: parsedDetails.status || "active",
        stage: cleanStage || "",
        lifetime_milk: Number(parsedDetails.lifetime_milk) || 0,
        daily_average: Number(parsedDetails.daily_average) || 0,
        total_offspring: Number(parsedDetails.total_offspring) || 0,
        pregnancy: {
          is_pregnant: Boolean(parsedDetails.is_pregnant),
          expected_due_date: parsedDetails.expected_due_date || null,
          insemination_id: parsedDetails.insemination_id || null,
        },
      };
    } else {
      return res.status(403).json({
        success: false,
        message: "Unauthorized role",
      });
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
};// GET all active listings (Marketplace homepage)
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

    // ✅ Handle photos properly
    let finalPhotos = [];

    // If existingPhotos is sent (during save with new files)
    if (req.body.existingPhotos) {
      try {
        const parsed = JSON.parse(req.body.existingPhotos);
        if (Array.isArray(parsed)) {
          finalPhotos = parsed.filter(p => p && typeof p === 'string');
        }
      } catch (e) {
        console.error("Failed to parse existingPhotos:", e);
      }
    } 
    // If photos is sent directly (during delete)
    else if (req.body.photos) {
      if (Array.isArray(req.body.photos)) {
        finalPhotos = req.body.photos.filter(p => p && typeof p === 'string');
      } else if (typeof req.body.photos === 'string') {
        try {
          const parsed = JSON.parse(req.body.photos);
          if (Array.isArray(parsed)) {
            finalPhotos = parsed.filter(p => p && typeof p === 'string');
          }
        } catch {
          finalPhotos = [req.body.photos];
        }
      }
    } 
    // Otherwise keep existing
    else {
      finalPhotos = Array.isArray(existing.photos) ? existing.photos : [];
    }

    // Add new uploaded photos
    if (req.files && req.files.length > 0) {
      const newPhotos = req.files.map(f => f.path);
      console.log("✅ New uploads:", newPhotos);
      finalPhotos = [...finalPhotos, ...newPhotos];
    }

    // Remove duplicates
    updates.photos = [...new Set(finalPhotos)];

    console.log("📸 Final photos:", updates.photos);

    // Remove existingPhotos from updates (not a schema field)
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
};
// ---------------------------
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