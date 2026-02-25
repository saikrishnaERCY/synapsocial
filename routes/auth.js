const router = require('express').Router();
const passport = require('passport');
const { signup, login } = require('../controllers/authController');

// Email auth
router.post('/signup', signup);
router.post('/login', login);

// Google OAuth
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Store user info in query params so frontend can save to localStorage
    const user = req.user;
    const userData = encodeURIComponent(JSON.stringify({
      id: user._id,
      name: user.name,
      email: user.email
    }));
    res.redirect(`${process.env.CLIENT_URL}/dashboard?googleUser=${userData}`);
  }
);

// Get current user
router.get('/me', (req, res) => {
  if (req.user) {
    res.json({ user: req.user });
  } else {
    res.status(401).json({ message: 'Not logged in' });
  }
});
router.get('/me', (req, res) => {
  if (req.user) {
    res.json({
      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        avatar: req.user.avatar,
        connectedPlatforms: req.user.connectedPlatforms
      }
    });
  } else {
    res.status(401).json({ message: 'Not logged in' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.logout(() => res.redirect(process.env.CLIENT_URL));
});

module.exports = router;