const router = require('express').Router();
const auth = require('../controllers/auth.controller');
const { authenticate } = require('../lib/auth');

router.get('/me', authenticate, auth.me);
router.patch('/profile', authenticate, auth.updateProfile);
router.post('/register', auth.register);
router.post('/login', auth.login);
router.post('/forgot-password', auth.forgotPassword);
router.post('/reset-password', auth.resetPassword);

module.exports = router;