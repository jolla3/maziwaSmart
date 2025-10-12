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
// ✅ controllers/marketController.js
exports.getMarketListingById = async (req, res) => {
  try {
    const { id } = req.params;

    // Populate both animal and seller
    const listing = await Listing.findById(id)
      .populate("animal_id")
      .populate("seller", "fullname phone email role _id"); // ✅ Add seller info

    if (!listing) {
      return res.status(404).json({ success: false, message: "Listing not found" });
    }

    const animal = listing.animal_id;

    const animalDetails = {
      name: animal.cow_name,
      species: animal.species,
      gender: animal.gender,
      stage: animal.stage,
      status: animal.status,
      breed: animal.breed_id || animal.bull_breed || "Unknown",
      lifetime_milk: animal.lifetime_milk,
      daily_average: animal.daily_average,
      bull_code: animal.bull_code || null,
      bull_name: animal.bull_name || null,
      bull_breed: animal.bull_breed || null,
      calved_count: animal.calved_count || 0,
    };

    res.status(200).json({
      success: true,
      listing: {
        _id: listing._id,
        title: listing.title,
        price: listing.price,
        photos: listing.photos,
        location: listing.location,
        createdAt: listing.createdAt,
        views: listing.views,
        seller: listing.seller, // ✅ expose seller data
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
