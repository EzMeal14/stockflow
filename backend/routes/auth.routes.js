const router = require('express').Router();
const auth = require('../controllers/auth.controller');

router.post('/register', auth.requestRegistrationCode);
router.post('/register/verify', auth.verifyRegistration);
router.post('/login', auth.login);
router.post('/forgot-password', auth.forgotPassword);
router.post('/reset-password', auth.resetPassword);

module.exports = router;