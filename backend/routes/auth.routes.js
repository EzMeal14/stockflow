const router = require('express').Router();
const { rateLimit } = require('express-rate-limit');
const auth = require('../controllers/auth.controller');
const { authenticate } = require('../lib/auth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please try again in an hour.' },
});
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts. Please try again in 15 minutes.' },
});

router.get('/me', authenticate, auth.me);
router.patch('/profile', authenticate, auth.updateProfile);
router.post('/register', registrationLimiter, auth.register);
router.post('/login', loginLimiter, auth.login);
router.post('/forgot-password', passwordResetLimiter, auth.forgotPassword);
router.post('/reset-password', passwordResetLimiter, auth.resetPassword);

module.exports = router;