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
      passReqToCallback: true, // ✅ allows us to access req.query.role
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const roleFromFrontend = req.query.role || "buyer"; // default to buyer
        const email = profile.emails?.[0]?.value;
        if (!email) return done(null, false, { message: "No email from Google" });

        let user;
        if (roleFromFrontend === "farmer") {
          user = await Farmer.findOne({ email });
          if (!user) {
            user = new Farmer({
              fullname: profile.displayName,
              email,
              photo: profile.photos?.[0]?.value,
              role: "farmer",
            });
            await user.save();
          }
        } else {
          user = await User.findOne({ email });
          if (!user) {
            user = new User({
              username: profile.displayName,
              email,
              role: roleFromFrontend,
              photo: profile.photos?.[0]?.value,
            });
            await user.save();
          }
        }

        return done(null, user);
      } catch (err) {
        console.error("GoogleStrategy error:", err);
        return done(err, null);
      }
    }
  )
);
  module.exports = passport;
