// passport.js
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { User, Farmer } = require("../models/model");
const { sendWelcomeEmail } = require("../utils/emailService");

const callbackURL =
  process.env.NODE_ENV === "production"
    ? "https://maziwasmart.onrender.com/api/userAuth/google/callback"
    : "http://localhost:5000/api/userAuth/google/callback";

// ---------------------------------------------------------
// Helper: normalize user for downstream logic
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
        // ROLE FROM FRONTEND STATE (LOCKED)
        // -----------------------------------------
        let role = "buyer";
        try {
          if (req.query.state) {
            const parsed = JSON.parse(req.query.state);
            if (parsed?.role) {
              role = String(parsed.role).toLowerCase();
            }
          }
        } catch (_) {}

        // Only allow known roles
        const ALLOWED_ROLES = ["buyer", "farmer", "seller", "broker", "manager"];
        if (!ALLOWED_ROLES.includes(role)) {
          role = "buyer";
        }

        // -----------------------------------------
        // EMAIL (MANDATORY)
        // -----------------------------------------
        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) {
          return done(null, false, { message: "No email returned from Google" });
        }

        // -----------------------------------------
        // 1. EXISTING USER
        // -----------------------------------------
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return done(null, wrapUser(existingUser, "User"));
        }

        // -----------------------------------------
        // 2. EXISTING FARMER
        // -----------------------------------------
        const existingFarmer = await Farmer.findOne({ email });
        if (existingFarmer) {
          return done(null, wrapUser(existingFarmer, "Farmer"));
        }

        // -----------------------------------------
        // 3. CREATE NEW FARMER
        // -----------------------------------------
        if (role === "farmer") {
          const farmer = new Farmer({
            fullname: profile.displayName || "Unnamed Farmer",
            email,
            photo: profile.photos?.[0]?.value || null,
            role: "farmer",
            farmer_code: null,
            phone: null,
            is_active: true,
            auth_provider: "google",
            needs_password_setup: true
          });

          const saved = await farmer.save();

          sendWelcomeEmail(saved.email, saved.fullname, "farmer")
            .catch(console.error);

          return done(null, wrapUser(saved, "Farmer"));
        }

        // -----------------------------------------
        // 4. CREATE NEW USER
        // -----------------------------------------
        const user = new User({
          username: profile.displayName || "Unnamed User",
          email,
          role,
          photo: profile.photos?.[0]?.value || null,
          auth_provider: "google",
          needs_password_setup: true
        });

        const savedUser = await user.save();

        sendWelcomeEmail(savedUser.email, savedUser.username, role)
          .catch(console.error);

        return done(null, wrapUser(savedUser, "User"));

      } catch (err) {
        console.error("Google Strategy Error:", err);
        return done(err, null);
      }
    }
  )
);

// ---------------------------------------------------------
// SERIALIZATION
// ---------------------------------------------------------
passport.serializeUser((user, done) => {
  done(null, {
    id: user._id || user.id,
    collection: user._collection
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
