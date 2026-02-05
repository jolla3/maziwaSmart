const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { User, Farmer } = require("../models/model");
const { sendWelcomeEmail } = require("../utils/emailService");
const callbackURL =
  process.env.NODE_ENV === "production"
    ? "https://maziwasmart.onrender.com/api/userAuth/google/callback"
    : "http://localhost:5000/api/userAuth/google/callback";

// ---------------------------------------------------------
// Helper (simplified: no toObject or _collection needed)
// ---------------------------------------------------------
const wrapUser = (doc) => doc;

// ---------------------------------------------------------
// GOOGLE STRATEGY
// ---------------------------------------------------------
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        let role = "buyer";
        try {
          if (req.query.state) {
            role = JSON.parse(req.query.state).role || "buyer";
          }
        } catch (_) {}
        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) return done(null, false);

        // Check Farmer first for consistency
        const farmer = await Farmer.findOne({ email });
        if (farmer) {
          if (role !== "farmer") return done(new Error("Role mismatch: Account is farmer-only"), false);
          return done(null, wrapUser(farmer));
        }

        const user = await User.findOne({ email });
        if (user) {
          if (role !== user.role) return done(new Error(`Role mismatch: Account role is ${user.role}`), false);
          return done(null, wrapUser(user));
        }

        // ---------------- CREATE FARMER -------
        if (role === "farmer") {
          const created = await Farmer.create({
            fullname: profile.displayName,
            email,
            role: "farmer",
            photo: profile.photos?.[0]?.value || null,
            is_active: true,
            onboarding_complete: false,
          });
          sendWelcomeEmail(created.email, created.fullname, "farmer").catch(() => {});
          return done(null, wrapUser(created));
        }

        // ---------------- CREATE USER ---------
        const created = await User.create({
          username: profile.displayName,
          email,
          role,
          photo: profile.photos?.[0]?.value || null,
          onboarding_complete: false,
        });
        sendWelcomeEmail(created.email, created.username, role).catch(() => {});
        return done(null, wrapUser(created));
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// ---------------------------------------------------------
passport.serializeUser((user, done) => {
  const collection = user.role === "farmer" ? "Farmer" : "User"; // Derive collection from role for deserialize
  done(null, { id: user._id, collection });
});

passport.deserializeUser(async ({ id, collection }, done) => {
  const Model = collection === "Farmer" ? Farmer : User;
  done(null, await Model.findById(id));
});

module.exports = passport;