const router = require('express').Router();
const lookups = require('../controllers/lookups.controller');
const { authenticate, requireRole } = require('../lib/auth');

router.use(authenticate);

router.get('/drivers', requireRole('admin', 'staff'), lookups.drivers);
router.get('/warehouses', requireRole('admin', 'staff'), lookups.warehouses);
router.get('/availability', requireRole('admin', 'client'), lookups.availability);

module.exports = router;
