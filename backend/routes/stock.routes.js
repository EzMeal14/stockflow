const router = require('express').Router();
const stock = require('../controllers/stock.controller');
const { authenticate, requireRole } = require('../lib/auth');

router.use(authenticate);

router.post('/restock', requireRole('admin', 'staff'), stock.restock);
router.post('/transfer', requireRole('admin', 'staff'), stock.transfer);
router.get('/low', requireRole('admin', 'staff'), stock.lowStock);
router.get('/movements', requireRole('admin', 'staff'), stock.movements);

module.exports = router;