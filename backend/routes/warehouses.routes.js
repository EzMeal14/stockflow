const router = require('express').Router();
const warehouses = require('../controllers/warehouses.controller');

router.get('/', warehouses.list);
router.get('/:id', warehouses.getOne);
router.get('/:id/inventory', warehouses.inventory);
router.post('/', warehouses.create);
router.put('/:id', warehouses.update);
router.delete('/:id', warehouses.deactivate);

module.exports = router;