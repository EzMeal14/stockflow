const router = require('express').Router();
const drivers = require('../controllers/drivers.controller');
const { authenticate, requireRole } = require('../lib/auth');

router.use(authenticate);

router.get('/', requireRole('admin'), drivers.list);
router.post('/', requireRole('admin'), drivers.create);
router.patch('/:id/availability', requireRole('admin'), drivers.setAvailability);
router.delete('/:id', requireRole('admin'), drivers.remove);

module.exports = router;
