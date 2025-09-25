const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { User } = require("../models/model");

// Decide callback URL dynamically
const callbackURL =
  process.env.NODE_ENV === "production"
    ? "https://maziwasmart.onrender.com/api/auth/google/callback"
    : "http://localhost:5000/api/auth/google/callback"; // 👈 adjust if your local port is different

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        let user = await User.findOne({ email });

        if (!user) {
          user = new User({
            username: profile.displayName,
            email,
            role: "buyer", // default role, superadmin can upgrade to seller later
            photo: profile.photos?.[0]?.value,
            email_verified: true,
          });
          await user.save();
        }

        return done(null, user);
      } catch (err) {
        console.error("GoogleStrategy error:", err);
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
