const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');
const { parseItemId, nextItemId, renumberActiveItemIds } = require('../lib/item-id');

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

exports.listInactive = async (req, res) => {
  try {
    const items = await prisma.items.findMany({
      where: { is_active: false },
      orderBy: { name: 'asc' },
    });
    res.json(items);
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
    const item = await prisma.$transaction(async (tx) => {
      await tx.items.update({
        where: { item_id: req.params.id },
        data: { is_active: false },
      });
      await renumberActiveItemIds(tx);
      return tx.items.findUnique({ where: { item_id: req.params.id } });
    });
    res.json(item);
  } catch (err) {
    handleError(res, err);
  }
};

exports.restore = async (req, res) => {
  try {
    const item = await prisma.$transaction(async (tx) => {
      const current = await tx.items.findUnique({ where: { item_id: req.params.id } });
      if (!current) return null;
      if (!current.is_active) {
        await tx.items.update({
          where: { item_id: req.params.id },
          data: { is_active: true },
        });
        await renumberActiveItemIds(tx);
      }
      return tx.items.findUnique({ where: { item_id: req.params.id } });
    });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    handleError(res, err);
  }
};

exports.deleteInactive = async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.items.findUnique({ where: { item_id: req.params.id } });
      if (!item) return { status: 404, error: 'Not found' };
      if (item.is_active) {
        return { status: 409, error: 'Only deactivated items can be permanently deleted' };
      }

      const [inventoryCount, orderItemCount] = await Promise.all([
        tx.inventory.count({ where: { item_id: req.params.id } }),
        tx.order_items.count({ where: { item_id: req.params.id } }),
      ]);
      if (inventoryCount || orderItemCount) {
        return {
          status: 409,
          error: 'This item has stock or order history and cannot be permanently deleted. Keep it deactivated to preserve those records.',
        };
      }

      await tx.items.delete({ where: { item_id: req.params.id } });
      return { status: 204 };
    });

    if (result.error) return res.status(result.status).json({ error: result.error });
    res.status(result.status).end();
  } catch (err) {
    if (err.code === 'P2003') {
      return res.status(409).json({
        error: 'This item has linked stock or order history and cannot be permanently deleted. Keep it deactivated to preserve those records.',
      });
    }
    handleError(res, err);
  }
};
