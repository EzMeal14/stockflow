const router = require('express').Router();
const shipments = require('../controllers/shipments.controller');
const { authenticate, requireRole } = require('../lib/auth');

router.use(authenticate);

router.get('/', requireRole('admin', 'staff', 'driver'), shipments.list);
router.get('/:id', requireRole('admin', 'staff', 'driver'), shipments.getOne);
router.post('/', requireRole('admin', 'staff'), shipments.create);
router.patch('/:id/status', requireRole('admin', 'driver'), shipments.updateStatus);

module.exports = router;