// controllers/marketController.js
const { Listing, View } = require('../models/model');

// ... (keep getMarketListings, but update filters to handle both paths)
exports.getMarketListings = async (req, res) => {
  try {
    const { gender, species, minPrice, maxPrice, stage, breed, pregnant, sort } = req.query;

    // Base filter: available listings
    let filter = { status: 'available' };

    // Unified filters: check animal_details or populated animal_id
    if (gender) filter.$or = [{ "animal_details.gender": gender }, { "animal_id.gender": gender }];
    if (species) filter.$or = [{ "animal_details.species": species }, { "animal_id.species": species }]; // Add species to animal_details if needed
    if (stage) filter.$or = [{ "animal_details.stage": stage }, { "animal_id.stage": stage }];
    if (breed) filter.$or = [{ "animal_details.breed_name": breed }, { "animal_id.breed_id": breed }];
    if (pregnant === "true") filter.$or = [{ "animal_details.status": "pregnant" }, { "animal_id.status": "pregnant" }];
    if (minPrice) filter.price = { ...filter.price || {}, $gte: Number(minPrice) };
    if (maxPrice) filter.price = { ...filter.price || {}, $lte: Number(maxPrice) };

    // Exclude sold/deceased (for animal_id cases)
    filter["animal_id.status"] = { $nin: ["sold", "deceased"] };

    // Sorting
    let sortOption = { createdAt: -1 }; // default: newest first
    if (sort === "price_asc") sortOption = { price: 1 };
    if (sort === "price_desc") sortOption = { price: -1 };
    if (sort === "views_desc") sortOption = { views: -1 };

    const listings = await Listing.find(filter)
      .populate("animal_id", "cow_name species gender stage status breed_id birth_date") // Add birth_date
      .select("title price location photos status createdAt views")
      .sort(sortOption);

    res.status(200).json({
      success: true,
      count: listings.length,
      listings,
    });
  } catch (err) {
    console.error("❌ Market fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch market listings" });
  }
};

// GET full details for a single listing
exports.getMarketListingById = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch listing + deeply populate
    const listing = await Listing.findById(id)
      .populate({
        path: "animal_id",
        select:
          "cow_name species breed_id mother_id lifetime_milk daily_average total_offspring status stage photos pregnancy offspring_ids birth_date age gender",
        populate: [
          { path: "breed_id", select: "breed_name" },
          {
            path: "mother_id",
            select:
              "cow_name breed_id lifetime_milk daily_average total_offspring birth_date gender",
            populate: { path: "breed_id", select: "breed_name" },
          },
          { path: "offspring_ids", select: "cow_name birth_date stage gender" },
          {
            path: "pregnancy.insemination_id",
            model: "Insemination",
            select:
              "insemination_date method bull_code bull_name bull_breed outcome expected_due_date",
          },
        ],
      })
      .populate("seller", "_id fullname email phone role")
      .populate("farmer", "_id fullname phone email location farmer_code");

    if (!listing) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    const viewsCount = await View.countDocuments({ listing_id: listing._id });

    const sellerData = listing.seller || listing.farmer || null;

    // Unified extraction from animal_details (now always present)
    const details = listing.animal_details;
    const animalData = {
      name: details.bull_name || details.breed_name || listing.animal_id?.cow_name || listing.title || "Unnamed",
      species: listing.animal_type || "Unknown",
      gender: details.gender || listing.animal_id?.gender,
      stage: details.stage || listing.animal_id?.stage,
      status: details.status || listing.animal_id?.status,
      breed: details.breed_name || listing.animal_id?.breed_id?.breed_name || "Unknown",
      lifetime_milk: details.lifetime_milk || listing.animal_id?.lifetime_milk || 0,
      daily_average: details.daily_average || listing.animal_id?.daily_average || 0,
      calved_count: details.total_offspring || listing.animal_id?.total_offspring || 0,
      age: details.age ,
      bull_code: details.bull_code || listing.animal_id?.pregnancy?.insemination_id?.bull_code || null,
      bull_name: details.bull_name || listing.animal_id?.pregnancy?.insemination_id?.bull_name || null,
      bull_breed: details.bull_breed || listing.animal_id?.pregnancy?.insemination_id?.bull_breed || null,
      pregnancy: {
        is_pregnant: details.pregnancy?.is_pregnant || listing.animal_id?.pregnancy?.is_pregnant || false,
        expected_due_date: details.pregnancy?.expected_due_date || listing.animal_id?.pregnancy?.expected_due_date || null,
      },
      photos: listing.photos || listing.animal_id?.photos || [],
      birth_date: details.birth_date || listing.animal_id?.birth_date || null, // For frontend if needed
    };

    res.status(200).json({
      success: true,
      listing: {
        ...listing.toObject(),
        _id: listing._id,
        views: viewsCount,
        title: listing.title,
        price: listing.price,
        images: listing.photos?.length ? listing.photos : animalData.photos || [],
        location: listing.location,
        createdAt: listing.createdAt,
        seller: sellerData,
        animal: animalData,
      },
    });
  } catch (err) {
    console.error("❌ Market single fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch listing details" });
  }
};

// (keep getTrendingListings, add populate as needed)

// ---------------------------------------
// GET trending listings (top 10 by views)
// ---------------------------
exports.getTrendingListings = async (req, res) => {
  try {
    const listings = await Listing.find({
      status: 'available',
      "animal_id.status": { $nin: ["sold", "deceased"] }
    })
      .sort({ views: -1 })
      .limit(10)
      .populate("animal_id", "cow_name species gender stage status")
      .select("title price location photos status views");

    res.status(200).json({
      success: true,
      count: listings.length,
      listings,
    });
  } catch (err) {
    console.error("❌ Trending fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch trending listings" });
  }
};
