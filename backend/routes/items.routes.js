const router = require('express').Router();
const items = require('../controllers/items.controller');
const { authenticate, requireRole } = require('../lib/auth');

router.use(authenticate);

router.get('/inactive', requireRole('admin'), items.listInactive);
router.post('/:id/restore', requireRole('admin'), items.restore);
router.get('/', requireRole('admin', 'staff', 'client'), items.list);
router.get('/:id', requireRole('admin', 'staff', 'client'), items.getOne);
router.post('/', requireRole('admin'), items.create);
router.put('/:id', requireRole('admin'), items.update);
router.delete('/:id', requireRole('admin'), items.deactivate);

module.exports = router;