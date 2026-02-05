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
// Helper
// ---------------------------------------------------------
const wrapUser = (doc, collection) => {
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

        // ---------------- USER ----------------
        const user = await User.findOne({ email });
        if (user) return done(null, wrapUser(user, "User"));

        // ---------------- FARMER --------------
        const farmer = await Farmer.findOne({ email });
        if (farmer) return done(null, wrapUser(farmer, "Farmer"));

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
          return done(null, wrapUser(created, "Farmer"));
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
        return done(null, wrapUser(created, "User"));

      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// ---------------------------------------------------------
passport.serializeUser((user, done) => {
  done(null, { id: user._id, collection: user._collection });
});

passport.deserializeUser(async ({ id, collection }, done) => {
  const Model = collection === "Farmer" ? Farmer : User;
  done(null, await Model.findById(id));
});

module.exports = passport;
