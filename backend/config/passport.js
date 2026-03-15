const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const neonService = require('../services/database/neonService');

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('Warning: Google OAuth credentials not found. Google authentication will be disabled.');
  console.log('Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file');

  passport.use('google', {
    authenticate: function (req, options) {
      this.fail({ message: 'Google OAuth is not configured' });
    },
  });
} else {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile?.emails?.[0]?.value?.toLowerCase();
          if (!email) return done(new Error('Google profile email not found'), null);

          let user = await neonService.findUserByEmail(email);

          if (user) {
            return done(null, user);
          }

          const created = await neonService.createUser({
            name: profile.displayName || email.split('@')[0],
            email,
            password: 'google-auth',
            role: 'student',
            isVerified: true,
          });

          return done(null, created);
        } catch (error) {
          console.error('Google Strategy Error:', error);
          return done(error, null);
        }
      }
    )
  );
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await neonService.findUserById(id);
    done(null, user || null);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
