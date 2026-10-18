const router = require('express').Router();
const warehouses = require('../controllers/warehouses.controller');
const { authenticate, requireRole } = require('../lib/auth');

router.use(authenticate);

router.get('/', requireRole('admin', 'staff', 'client'), warehouses.list);
router.get('/:id', requireRole('admin', 'staff'), warehouses.getOne);
router.get('/:id/inventory', requireRole('admin', 'staff'), warehouses.inventory);
router.post('/', requireRole('admin'), warehouses.create);
router.put('/:id', requireRole('admin'), warehouses.update);
router.delete('/:id', requireRole('admin'), warehouses.deactivate);

module.exports = router;