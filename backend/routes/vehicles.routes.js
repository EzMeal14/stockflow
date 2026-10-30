const router = require('express').Router();
const vehicles = require('../controllers/vehicles.controller');
const { authenticate, requireRole } = require('../lib/auth');

router.use(authenticate);

router.get('/', requireRole('admin', 'staff', 'driver'), vehicles.list);
router.get('/inactive', requireRole('admin'), vehicles.listInactive);
router.post('/', requireRole('admin'), vehicles.create);
router.post('/:id/restore', requireRole('admin'), vehicles.restore);
router.put('/:id', requireRole('admin'), vehicles.update);
router.delete('/:id', requireRole('admin'), vehicles.deactivate);

module.exports = router;