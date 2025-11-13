// passport.js
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { User, Farmer } = require("../models/model");

const callbackURL =
  process.env.NODE_ENV === "production"
    ? "https://maziwasmart.onrender.com/api/userAuth/google/callback"
    : "http://localhost:5000/api/userAuth/google/callback";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
      passReqToCallback: true, // IMPORTANT: allows access to req
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // ✅ Extract role from OAuth state parameter
        let roleFromFrontend = "buyer"; // default
        
        try {
          const state = req.query.state;
          if (state) {
            const parsed = JSON.parse(state);
            roleFromFrontend = (parsed.role || "buyer").toLowerCase();
          }
        } catch (e) {
          console.log("Could not parse state, using default role");
        }

        const email = profile.emails?.[0]?.value || null;

        if (!email) {
          return done(null, false, { message: "No email returned from Google" });
        }

        console.log(`🔍 Google OAuth: email=${email}, role=${roleFromFrontend}`);

        // Try finding existing user
        let user = await User.findOne({ email }).lean();
        let userCollection = "User";

        if (!user) {
          user = await Farmer.findOne({ email }).lean();
          if (user) userCollection = "Farmer";
        }

        // If user exists, return it
        if (user) {
          user._collection = userCollection;
          console.log(`✅ Existing user found in ${userCollection}`);
          return done(null, user);
        }

        // ✅ No user found -> create based on role
        if (roleFromFrontend === "farmer") {
          console.log("🌱 Creating new Farmer account");
          const newFarmer = new Farmer({
            fullname: profile.displayName || "Unnamed Farmer",
            email,
            photo: profile.photos?.[0]?.value || null,
            role: "farmer",
            is_active: true,
          });
          const saved = await newFarmer.save();
          const savedObj = saved.toObject();
          savedObj._collection = "Farmer";
          console.log(`✅ New Farmer created: ${savedObj._id}`);
          return done(null, savedObj);
        } else {
          console.log("👤 Creating new User account");
          const newUser = new User({
            username: profile.displayName || "Unnamed User",
            email,
            role: roleFromFrontend || "buyer",
            photo: profile.photos?.[0]?.value || null,
          });
          const saved = await newUser.save();
          const savedObj = saved.toObject();
          savedObj._collection = "User";
          console.log(`✅ New User created: ${savedObj._id}`);
          return done(null, savedObj);
        }
      } catch (err) {
        console.error("❌ GoogleStrategy error:", err);
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, { id: user._id || user.id, collection: user._collection || "User" });
});

passport.deserializeUser(async (obj, done) => {
  try {
    if (!obj) return done(null, null);
    const { id, collection } = obj;
    if (collection === "Farmer") {
      const farmer = await Farmer.findById(id);
      return done(null, farmer);
    } else {
      const user = await User.findById(id);
      return done(null, user);
    }
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;