const router = require('express').Router();
const items = require('../controllers/items.controller');

router.get('/', items.list);
router.get('/:id', items.getOne);
router.post('/', items.create);
router.put('/:id', items.update);
router.delete('/:id', items.deactivate);

module.exports = router;