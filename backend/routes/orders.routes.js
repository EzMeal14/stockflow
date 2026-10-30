const router = require('express').Router();
const orders = require('../controllers/orders.controller');
const { authenticate, requireRole } = require('../lib/auth');

router.use(authenticate);

router.get('/', orders.list);
router.get('/:id', orders.getOne);
router.post('/', requireRole('client', 'admin'), orders.create);
router.post('/:id/confirm', requireRole('admin', 'staff'), orders.confirm);

module.exports = router;