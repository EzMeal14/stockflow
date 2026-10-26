const router = require('express').Router();
const staff = require('../controllers/staff.controller');
const { authenticate, requireRole } = require('../lib/auth');

router.use(authenticate);

router.get('/', requireRole('admin'), staff.list);
router.post('/', requireRole('admin'), staff.create);
router.delete('/:id', requireRole('admin'), staff.remove);

module.exports = router;
