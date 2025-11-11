// passport.js
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { User, Farmer } = require("../models/model"); // adjust path

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
      passReqToCallback: true, // IMPORTANT: allows access to req.query.role
    },
    // (req, accessToken, refreshToken, profile, done)
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const roleFromFrontend = (req.query?.role || "buyer").toLowerCase();
        const email = profile.emails?.[0]?.value || null;

        if (!email) {
          // If Google didn't return email, fail early
          return done(null, false, { message: "No email returned from Google" });
        }

        // Try finding an existing user: check User -> Farmer (match your app order)
        let user = await User.findOne({ email }).lean();
        let userCollection = "User";

        if (!user) {
          user = await Farmer.findOne({ email }).lean();
          if (user) userCollection = "Farmer";
        }

        // If user exists, return it (we pass to req.user)
        if (user) {
          // attach a flag to identify which collection this came from
          user._collection = userCollection;
          return done(null, user);
        }

        // No user found -> create in the collection selected by frontend role
        if (roleFromFrontend === "farmer") {
          // create farmer
          const newFarmer = new Farmer({
            fullname: profile.displayName || "Unnamed Farmer",
            email,
            photo: profile.photos?.[0]?.value || null,
            // other farmer-specific fields: farmer_code etc. if you have generation logic do it in controllers
          });
          const saved = await newFarmer.save();
          const savedObj = saved.toObject();
          savedObj._collection = "Farmer";
          return done(null, savedObj);
        } else {
          // default: create User (buyer/seller etc.)
          const newUser = new User({
            username: profile.displayName || "Unnamed User",
            email,
            role: roleFromFrontend || "buyer",
            photo: profile.photos?.[0]?.value || null,
          });
          const saved = await newUser.save();
          const savedObj = saved.toObject();
          savedObj._collection = "User";
          return done(null, savedObj);
        }
      } catch (err) {
        console.error("GoogleStrategy error:", err);
        return done(err, null);
      }
    }
  )
);

// Note: because we use session:false in your routes, serialize/deserialize are not required.
// But if you keep them, use something simple:
passport.serializeUser((user, done) => {
  // user might be plain object or mongoose doc
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
