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

    const {
      title,
      animal_type,
      animal_id,
      price,
      description,
      location,
      farmer_id,
      animal_details,
    } = req.body;

    console.log("🧠 Body received:", req.body);
    console.log("🧠 Files received:", req.files?.map(f => f.originalname) || []);

    // ✅ Parse animal_details
    let parsedDetails = {};
    if (typeof animal_details === "string") {
      try {
        parsedDetails = JSON.parse(animal_details);
      } catch (e) {
        console.error("⚠️ Error parsing animal_details JSON:", e.message);
        parsedDetails = {};
      }
    } else if (typeof animal_details === "object" && animal_details !== null) {
      parsedDetails = animal_details;
    }

    // ✅ Upload to Cloudinary
    let uploadedPhotos = [];
    if (req.files && req.files.length > 0) {
      console.log(`📸 Uploading ${req.files.length} image(s) to Cloudinary...`);

      const uploadPromises = req.files.map(async (file) => {
        try {
          const result = await cloudinary.uploader.upload(file.path, {
            folder: "maziwasmart/listings",
            resource_type: "image",
          });
          console.log("✅ Cloudinary upload success:", result.secure_url);
          return result.secure_url;
        } catch (uploadErr) {
          console.error("❌ Cloudinary upload failed:", uploadErr);
          return null;
        }
      });

      uploadedPhotos = (await Promise.all(uploadPromises)).filter(Boolean);
    }

    // ✅ Basic validation
    if (!title || !animal_type || !price) {
      return res.status(400).json({
        success: false,
        message: "Title, animal type, and price are required",
      });
    }

    const sellerRef = req.user.id;
    let farmerRef = null;

    const listingData = {
      title,
      animal_type,
      animal_id: null,
      farmer: null,
      seller: sellerRef,
      price,
      description: description || "",
      photos: uploadedPhotos,
      location: location || "",
      status: "available",
    };

    // ✅ Validation for stages
    const validStages = [
      "calf", "heifer", "cow",
      "bull_calf", "young_bull", "mature_bull",
      "kid", "doeling", "buckling", "nanny", "buck",
      "lamb", "ewe", "ram",
      "piglet", "gilt", "sow", "boar"
    ];

    // 👨‍🌾 FARMER
    if (req.user.role === "farmer") {
      console.log("👨‍🌾 Creating listing for farmer");
      const farmerDoc = await Farmer.findById(req.user.id);
      if (!farmerDoc)
        return res.status(404).json({ success: false, message: "Farmer not found" });

      farmerRef = farmerDoc._id;
      listingData.farmer = farmerRef;

      if (animal_id) {
        const animal = await Cow.findById(animal_id);
        if (!animal)
          return res.status(404).json({ success: false, message: "Animal not found" });
        listingData.animal_id = animal._id;
      }

      if (!listingData.location) listingData.location = farmerDoc.location;
    }

    // 🧑‍💼 SELLER
    else if (req.user.role === "seller") {
      console.log("🧑‍💼 Creating listing for seller");
      const sellerDoc = await User.findById(sellerRef);
      if (!sellerDoc || !sellerDoc.is_approved_seller) {
        return res.status(403).json({
          success: false,
          message: "Seller not approved by SuperAdmin",
        });
      }

      if (animal_id) {
        return res.status(400).json({
          success: false,
          message: "Sellers cannot provide animal_id; details must be manual",
        });
      }

      if (!parsedDetails.age || !parsedDetails.breed_name) {
        return res.status(400).json({
          success: false,
          message: "Sellers must provide 'age' and 'breed_name'",
        });
      }

      let cleanStage = null;
      if (parsedDetails.stage && validStages.includes(parsedDetails.stage))
        cleanStage = parsedDetails.stage;
      else {
        const defaults = {
          cow: "cow",
          bull: "mature_bull",
          goat: "nanny",
          sheep: "ewe",
          pig: "sow",
        };
        cleanStage = defaults[animal_type] || null;
      }

      listingData.farmer = farmer_id || null;
      listingData.animal_details = {
        age: Number(parsedDetails.age),
        breed_name: parsedDetails.breed_name,
        ...(parsedDetails.gender && { gender: parsedDetails.gender }),
        ...(parsedDetails.bull_code && { bull_code: parsedDetails.bull_code }),
        ...(parsedDetails.bull_name && { bull_name: parsedDetails.bull_name }),
        ...(parsedDetails.bull_breed && { bull_breed: parsedDetails.bull_breed }),
        status: parsedDetails.status || "active",
        ...(cleanStage && { stage: cleanStage }),
        lifetime_milk: parsedDetails.lifetime_milk || 0,
        daily_average: parsedDetails.daily_average || 0,
        total_offspring: parsedDetails.total_offspring || 0,
        pregnancy: {
          is_pregnant: parsedDetails.is_pregnant || false,
          expected_due_date: parsedDetails.expected_due_date || null,
          ...(parsedDetails.insemination_id && {
            insemination_id: parsedDetails.insemination_id,
          }),
        },
      };
    }

    // 🚫 Unauthorized
    else {
      return res.status(403).json({
        success: false,
        message: "Unauthorized role — cannot create listing",
      });
    }

    // ✅ Save listing
    const listing = new Listing(listingData);
    await listing.save();

    console.log("✅ Listing saved successfully:", listing._id);

    return res.status(201).json({
      success: true,
      message: "Listing created successfully ✅",
      listing,
    });
  } catch (err) {
    console.error("❌ Create listing error:", err);
    res.status(500).json({
      success: false,
      message: "Server error during listing creation",
      error: err.message,
    });
  }
};// ---------------------------
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

exports.updateListing = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("🟢 PATCH update called for:", id);
    console.log("🟢 req.user:", JSON.stringify(req.user, null, 2));
    console.log("🟢 req.files:", req.files?.map(f => f.path || f.secure_url) || []);
    console.log("🟢 req.body:", req.body);

    // 🧠 Prepare updates from body
    const updates = { ...req.body };

    // ✅ If files exist, upload each to Cloudinary
    let uploadedPhotos = [];
    if (req.files && req.files.length > 0) {
      console.log(`📸 Received ${req.files.length} files to upload...`);
      for (const file of req.files) {
        console.log(`⬆️ Uploading ${file.originalname}...`);
        const uploadResult = await cloudinary.uploader.upload(file.path, {
          folder: "maziwasmart/listings",
          resource_type: "image",
        });
        uploadedPhotos.push(uploadResult.secure_url);
        console.log("✅ Upload success:", uploadResult.secure_url);
      }
    }

    // 🧠 Fetch the existing listing
    const existing = await Listing.findOne({ _id: id, seller: req.user.id });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found or not owned by you",
      });
    }

    // 🧠 Merge photos — keep old ones + add new uploaded ones
    const existingPhotos = Array.isArray(existing.photos) ? existing.photos : [];
    const bodyPhotos = Array.isArray(req.body.photos)
      ? req.body.photos.filter(p => p && p.trim() !== "")
      : [];

    updates.photos = [...new Set([...existingPhotos, ...bodyPhotos, ...uploadedPhotos])];

    // 🧠 Save update
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

    console.log("✅ Listing updated successfully:", listing._id);
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
      error: err.message || "Unknown error",
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