// passport.js
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { User, Farmer } = require("../models/model");
const { sendWelcomeEmail } = require("../utils/emailService"); // Add this import—your code skips it, trash

const callbackURL =
  process.env.NODE_ENV === "production"
    ? "https://maziwasmart.onrender.com/api/userAuth/google/callback"
    : "http://localhost:5000/api/userAuth/google/callback";

// ---------------------------------------------------------
// Helper: Normalize user object for session storage
// ---------------------------------------------------------
const wrapUser = (doc, collection) => {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : doc;
  obj._collection = collection;
  return obj;
};

// ---------------------------------------------------------
// GOOGLE STRATEGY
// ---------------------------------------------------------
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // -----------------------------------------
        // ROLE FROM FRONTEND STATE (default buyer)
        // -----------------------------------------
        let role = "buyer";

        try {
          if (req.query.state) {
            const parsed = JSON.parse(req.query.state);
            role = (parsed.role || "buyer").toLowerCase();
          }
        } catch (_) {
          // If invalid JSON: ignore silently
        }

        // -----------------------------------------
        // EXTRACT EMAIL
        // -----------------------------------------
        const email = profile.emails?.[0]?.value;
        if (!email) return done(null, false, { message: "No email returned from Google" });

        // -----------------------------------------
        // 1: Check User collection
        // -----------------------------------------
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return done(null, wrapUser(existingUser, "User"));
        }

        // -----------------------------------------
        // 2: Check Farmer collection
        // -----------------------------------------
        const existingFarmer = await Farmer.findOne({ email });
        if (existingFarmer) {
          return done(null, wrapUser(existingFarmer, "Farmer"));
        }

        // -----------------------------------------
        // 3: Create new Farmer (if role = farmer)
        // -----------------------------------------
        if (role === "farmer") {
          const newFarmer = new Farmer({
            fullname: profile.displayName || "Unnamed Farmer",
            email,
            photo: profile.photos?.[0]?.value || null,
            role: "farmer",
            farmer_code: null, // Filled later manually
            phone: null,
            is_active: true
          });

          const savedFarmer = await newFarmer.save();
          // Welcome email—non-blocking
          if (savedFarmer.email && savedFarmer.fullname) {
            sendWelcomeEmail(savedFarmer.email, savedFarmer.fullname, "farmer")
              .catch(console.error); // Log fail, don't crash auth
          }
          return done(null, wrapUser(savedFarmer, "Farmer"));
        }

        // -----------------------------------------
        // 4: Default → Create new User
        // -----------------------------------------
        const newUser = new User({
          username: profile.displayName || "Unnamed User",
          email,
          role, // buyer | seller | admin | broker | manager etc.
          photo: profile.photos?.[0]?.value || null
        });

        const savedUser = await newUser.save();
        // Welcome email—non-blocking
        if (savedUser.email && savedUser.username) {
          sendWelcomeEmail(savedUser.email, savedUser.username, role)
            .catch(console.error); // Log fail, don't crash auth
        }
        return done(null, wrapUser(savedUser, "User"));

      } catch (err) {
        console.error("Google Strategy Error:", err);
        return done(err, null);
      }
    }
  )
);

// ---------------------------------------------------------
// SERIALIZER / DESERIALIZER
// ---------------------------------------------------------
passport.serializeUser((user, done) => {
  done(null, {
    id: user._id || user.id,
    collection: user._collection || "User"
  });
});

passport.deserializeUser(async (obj, done) => {
  try {
    if (!obj) return done(null, null);

    const Model = obj.collection === "Farmer" ? Farmer : User;
    const user = await Model.findById(obj.id);

    return done(null, user || null);
  } catch (err) {
    return done(err, null);
  }
});

module.exports = passport;