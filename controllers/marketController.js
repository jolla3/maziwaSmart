// controllers/marketController.js
const { Listing } = require('../models/model');

// ---------------------------
// GET market listings with filters + sorting
// ---------------------------
exports.getMarketListings = async (req, res) => {
  try {
    const { gender, species, minPrice, maxPrice, stage, breed, pregnant, sort } = req.query;

    // ✅ Base filter: available listings, hide sold/deceased animals
    let filter = {
      status: 'available',
      "animal_id.status": { $nin: ["sold", "deceased"] }
    };

    // ✅ Filters
    if (gender) filter["animal_id.gender"] = gender;
    if (species) filter["animal_id.species"] = species;
    if (stage) filter["animal_id.stage"] = stage;
    if (breed) filter["animal_id.breed_id"] = breed;
    if (pregnant === "true") filter["animal_id.status"] = "pregnant";
    if (minPrice) filter.price = { ...filter.price, $gte: Number(minPrice) };
    if (maxPrice) filter.price = { ...filter.price, $lte: Number(maxPrice) };

    // ✅ Sorting
    let sortOption = { createdAt: -1 }; // default: newest first
    if (sort === "price_asc") sortOption = { price: 1 };
    if (sort === "price_desc") sortOption = { price: -1 };
    if (sort === "views_desc") sortOption = { views: -1 };

    const listings = await Listing.find(filter)
      .populate("animal_id", "cow_name species gender stage status breed_id")
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

// ---------------------------
// GET full details for a single listing
// ---------------------------

exports.getMarketListingById = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch listing + deeply populate related fields
    const listing = await Listing.findById(id)
      .populate({
        path: "animal_id",
        select:
          "cow_name species breed_id mother_id lifetime_milk daily_average total_offspring status stage photos pregnancy offspring_ids birth_date gender",
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
      .populate("seller", "_id fullname email phone role") // ✅ include _id
      .populate("farmer", "_id fullname phone email location farmer_code");

    if (!listing) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    const sellerData = listing.seller || listing.farmer || null;

    // Extract animal details safely
    const animal = listing.animal_id;
    const animalDetails = animal
      ? {
          name: animal.cow_name,
          species: animal.species,
          gender: animal.gender,
          stage: animal.stage,
          status: animal.status,
          breed:
            animal.breed_id?.breed_name ||
            animal.bull_breed ||
            "Unknown",
          lifetime_milk: animal.lifetime_milk,
          daily_average: animal.daily_average,
          bull_code: animal.pregnancy?.insemination_id?.bull_code || null,
          bull_name: animal.pregnancy?.insemination_id?.bull_name || null,
          bull_breed: animal.pregnancy?.insemination_id?.bull_breed || null,
          calved_count: animal.total_offspring || 0,
          photos: animal.photos || [], // ✅ include animal photos
        }
      : null;

    res.status(200).json({
      success: true,
      listing: {
        ...listing.toObject(),
        _id: listing._id,
        title: listing.title,
        price: listing.price,
        images: listing.photos?.length ? listing.photos : animalDetails?.photos || [],
        location: listing.location,
        createdAt: listing.createdAt,
        views: listing.views,
        seller: sellerData,
        animal: animalDetails,
      },
    });
  } catch (err) {
    console.error("❌ Market single fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch listing details" });
  }
};


// ---------------------------
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
