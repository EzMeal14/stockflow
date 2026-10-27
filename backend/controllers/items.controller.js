const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');
const { parseItemId, nextItemId } = require('../lib/item-id');

// Warehouse staff must not see prices
function forRole(user, item) {
  if (user.role === 'staff') {
    const { unit_price, ...rest } = item;
    return rest;
  }
  return item;
}

function validPrice(value) {
  return value !== undefined && value !== null && value !== '' && !Number.isNaN(Number(value)) && Number(value) >= 0;
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

// The ID is optional. Empty = next number. "2" = ID-002. A full ID is kept as typed.
exports.create = async (req, res) => {
  try {
    const { name, description, unit_price } = req.body;
    const parsed = parseItemId(req.body.id);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (!name || !validPrice(unit_price)) {
      return res.status(400).json({ error: 'name and a unit_price of 0 or more are required' });
    }

    let id = parsed.id;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (parsed.auto) id = await nextItemId(prisma);
      try {
        const item = await prisma.items.create({ data: { id, name, description, unit_price } });
        return res.status(201).json(item);
      } catch (err) {
        // Another admin took the same number a moment ago: try the next one
        if (err.code === 'P2002' && parsed.auto && attempt < 2) continue;
        throw err;
      }
    }
  } catch (err) {
    handleError(res, err);
  }
};

// An empty ID means "keep the current one".
exports.update = async (req, res) => {
  try {
    const { name, description, unit_price } = req.body;
    let id;
    const typed = req.body.id;
    if (typed !== undefined && typed !== null && String(typed).trim() !== '') {
      const parsed = parseItemId(typed);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      id = parsed.id;
    }
    if (unit_price !== undefined && !validPrice(unit_price)) {
      return res.status(400).json({ error: 'unit_price must be 0 or more' });
    }
    const item = await prisma.items.update({
      where: { item_id: req.params.id },
      data: { id, name, description, unit_price },
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
