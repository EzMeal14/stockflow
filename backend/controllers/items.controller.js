const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');

// Warehouse staff must not see prices
function forRole(user, item) {
  if (user.role === 'staff') {
    const { unit_price, ...rest } = item;
    return rest;
  }
  return item;
}

exports.list = async (req, res) => {
  try {
    const items = await prisma.items.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
    res.json(items.map((i) => forRole(req.user, i)));
  } catch (err) {
    handleError(res, err);
  }
};

exports.getOne = async (req, res) => {
  try {
    const item = await prisma.items.findUnique({ where: { item_id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(forRole(req.user, item));
  } catch (err) {
    handleError(res, err);
  }
};

exports.create = async (req, res) => {
  try {
    const { sku, name, description, unit_price } = req.body;
    if (!sku || !name || unit_price === undefined || Number(unit_price) < 0) {
      return res.status(400).json({ error: 'sku, name and a unit_price of 0 or more are required' });
    }
    const item = await prisma.items.create({
      data: { sku, name, description, unit_price },
    });
    res.status(201).json(item);
  } catch (err) {
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const { sku, name, description, unit_price } = req.body;
    const item = await prisma.items.update({
      where: { item_id: req.params.id },
      data: { sku, name, description, unit_price },
    });
    res.json(item);
  } catch (err) {
    handleError(res, err);
  }
};

// "DELETE" = soft delete. The app role is not allowed to delete rows.
exports.deactivate = async (req, res) => {
  try {
    const item = await prisma.items.update({
      where: { item_id: req.params.id },
      data: { is_active: false },
    });
    res.json(item);
  } catch (err) {
    handleError(res, err);
  }
};