const router = require('express').Router();
const orders = require('../controllers/orders.controller');

router.get('/', orders.list);
router.get('/:id', orders.getOne);
router.post('/', orders.create);
router.post('/:id/confirm', orders.confirm);

module.exports = router;