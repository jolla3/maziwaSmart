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
  location,
  farmer_id,
  animal_details
} = req.body;

// 🧠 Combine uploaded + text-sent photos
const uploadedPhotos = req.files?.map(file => `/uploads/animals/${file.filename}`) || [];
const bodyPhotos = Array.isArray(req.body.photos) ? req.body.photos : [];
const photos = [...bodyPhotos, ...uploadedPhotos].filter(p => p && p.trim() !== "");


    if (!title || !animal_type || !price) {
      return res.status(400).json({
        success: false,
        message: "Title, animal type, and price are required"
      });
    }
    

    const sellerRef = req.user.id;
    let farmerRef = null;

    let listingData = {
      title,
      animal_type,
      animal_id: null,
      farmer: null,
      seller: sellerRef,
      price,
      description: description || "",
      photos: photos.filter(p => p.trim() !== ""),
      location: location || ""
    };

    // ✅ FARMER FLOW
    if (req.user.role === "farmer") {
      const farmerDoc = await Farmer.findById(req.user.id);
      if (!farmerDoc) {
        return res.status(404).json({ success: false, message: "Farmer not found" });
      }

      farmerRef = farmerDoc._id;
      listingData.farmer = farmerRef;

      if (animal_id) {
        const cow = await Cow.findById(animal_id);
        if (!cow) {
          return res.status(404).json({ success: false, message: "Animal not found" });
        }
        listingData.animal_id = cow._id; // only store ref
      }

      if (!listingData.location) listingData.location = farmerDoc.location;
    }

    // ✅ SELLER FLOW
    else if (req.user.role === "seller") {
      const sellerDoc = await User.findById(sellerRef);
      if (!sellerDoc || !sellerDoc.is_approved_seller) {
        return res.status(403).json({
          success: false,
          message: "Seller not approved by SuperAdmin"
        });
      }

      if (animal_id) {
        return res.status(400).json({
          success: false,
          message: "External sellers cannot use animal_id, provide details manually"
        });
      }

      // 🐄 Validate seller-provided animal details
      if (!animal_details || !animal_details.age || !animal_details.breed_name) {
        return res.status(400).json({
          success: false,
          message: "Sellers must provide at least age and breed_name"
        });
      }

      listingData.farmer = farmer_id || null;

      // only include provided fields — no "" overwrites
      listingData.animal_details = {
        age: animal_details.age,
        breed_name: animal_details.breed_name,
        ...(animal_details.gender && { gender: animal_details.gender }),
        ...(animal_details.bull_code && { bull_code: animal_details.bull_code }),
        ...(animal_details.bull_name && { bull_name: animal_details.bull_name }),
        ...(animal_details.bull_breed && { bull_breed: animal_details.bull_breed }),
        status: animal_details.status || "active",
        ...(animal_details.stage && { stage: animal_details.stage }),
        lifetime_milk: animal_details.lifetime_milk || 0,
        daily_average: animal_details.daily_average || 0,
        total_offspring: animal_details.total_offspring || 0,
        pregnancy: {
          is_pregnant: animal_details.is_pregnant || false,
          expected_due_date: animal_details.expected_due_date || null,
          ...(animal_details.insemination_id && { insemination_id: animal_details.insemination_id })
        }
      };
    }

    // ❌ OTHER ROLES
    else {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to create listings"
      });
    }

    const listing = new Listing(listingData);
    await listing.save();

    res.status(201).json({
      success: true,
      message: "Listing created successfully",
      listing
    });
  } catch (err) {
    console.error("Create listing error:", err);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};
// ---------------------------
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
};

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
exports.updateListing = async (req, res) => {
  try {
    const { id } = req.params;

    // 🔹 Parse incoming update body (JSON fields)
    const updates = { ...req.body };

    // 🔹 Handle new uploaded photos (if any)
    const uploadedPhotos = req.files?.map(file => `/uploads/animals/${file.filename}`) || [];

    // 🔹 If there are new photos, merge them with existing ones
    if (uploadedPhotos.length > 0) {
      // Fetch existing listing first to merge
      const existing = await Listing.findOne({ _id: id, seller: req.user._id });
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Listing not found or not yours"
        });
      }

      // Combine old + new
      const existingPhotos = existing.photos || [];
      const bodyPhotos = Array.isArray(req.body.photos)
        ? req.body.photos.filter(p => p && p.trim() !== "")
        : [];

      // Merge and deduplicate
      updates.photos = [...new Set([...existingPhotos, ...bodyPhotos, ...uploadedPhotos])];

      // Then apply update
      const listing = await Listing.findByIdAndUpdate(id, updates, { new: true });

      return res.status(200).json({
        success: true,
        message: "Listing updated (with new photos)",
        listing
      });
    }

    // 🔹 No new files → standard update
    const listing = await Listing.findOneAndUpdate(
      { _id: id, seller: req.user._id },
      updates,
      { new: true }
    );

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: "Listing not found or not yours"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Listing updated",
      listing
    });
  } catch (err) {
    console.error("Update listing error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update listing",
      error: err.message
    });
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
