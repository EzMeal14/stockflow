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

function normalizeItemName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function hasActiveItemName(name, excludeItemId) {
  const normalizedName = normalizeItemName(name);
  if (!normalizedName) return false;
  const duplicates = excludeItemId
    ? await prisma.$queryRaw`
      SELECT item_id FROM items
      WHERE is_active = TRUE
        AND item_id <> ${excludeItemId}::uuid
        AND regexp_replace(lower(btrim(name)), '[[:space:]]+', ' ', 'g') = ${normalizedName}
      LIMIT 1`
    : await prisma.$queryRaw`
      SELECT item_id FROM items
      WHERE is_active = TRUE
        AND regexp_replace(lower(btrim(name)), '[[:space:]]+', ' ', 'g') = ${normalizedName}
      LIMIT 1`;
  return duplicates.length > 0;
}

function validImageData(value) {
  return typeof value === 'string'
    && Buffer.byteLength(value, 'utf8') <= 1500000
    && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function missingImageColumn(err) {
  const message = String(err.message).toLowerCase();
  return (err.code === 'P2022' && message.includes('image_data'))
    || (message.includes('image_data')
      && (message.includes('unknown field') || message.includes('unknown arg') || message.includes('unknown argument')));
}

const itemFields = {
  item_id: true,
  id: true,
  name: true,
  description: true,
  unit_price: true,
  is_active: true,
};

async function addTotalStock(items) {
  const totals = await prisma.inventory.groupBy({
    by: ['item_id'],
    _sum: { quantity: true },
  });
  const totalByItem = new Map(totals.map((row) => [row.item_id, row._sum.quantity || 0]));
  return items.map((item) => ({
    ...item,
    total_stock: totalByItem.get(item.item_id) || 0,
  }));
}

exports.list = async (req, res) => {
  try {
    const items = await prisma.items.findMany({
      select: itemFields,
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
    res.json(items.map((item) => forRole(req.user, item)));
  } catch (err) {
    handleError(res, err);
  }
};

exports.listAdmin = async (req, res) => {
  try {
    let items;
    try {
      items = await prisma.items.findMany({
        select: { ...itemFields, image_data: true },
        where: { is_active: true },
        orderBy: { name: 'asc' },
      });
    } catch (err) {
      if (!missingImageColumn(err)) throw err;
      console.warn('Database migration for item images is not applied; listing items without photos.');
      items = await prisma.items.findMany({
        select: itemFields,
        where: { is_active: true },
        orderBy: { name: 'asc' },
      });
    }
    res.json(await addTotalStock(items));
  } catch (err) {
    handleError(res, err);
  }
};

exports.clientCatalog = async (req, res) => {
  try {
    const items = await prisma.items.findMany({
      select: {
        item_id: true,
        id: true,
        name: true,
        unit_price: true,
        is_active: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json(items);
  } catch (err) {
    handleError(res, err);
  }
};

exports.listInactive = async (req, res) => {
  try {
    let items;
    try {
      items = await prisma.items.findMany({
        select: { ...itemFields, image_data: true },
        where: { is_active: false },
        orderBy: { name: 'asc' },
      });
    } catch (err) {
      if (!missingImageColumn(err)) throw err;
      console.warn('Database migration for item images is not applied; listing deactivated items without photos.');
      items = await prisma.items.findMany({
        select: itemFields,
        where: { is_active: false },
        orderBy: { name: 'asc' },
      });
    }
    res.json(await addTotalStock(items));
  } catch (err) {
    handleError(res, err);
  }
};

exports.getOne = async (req, res) => {
  try {
    const item = await prisma.items.findUnique({
      select: itemFields,
      where: { item_id: req.params.id },
    });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(forRole(req.user, item));
  } catch (err) {
    handleError(res, err);
  }
};

// The ID is optional. Empty = next number. "2" = ID-002. A full ID is kept as typed.
exports.create = async (req, res) => {
  try {
    const { name, description, unit_price, image_data } = req.body;
    const parsed = parseItemId(req.body.id);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (!name || !validPrice(unit_price)) {
      return res.status(400).json({ error: 'name and a unit_price of 0 or more are required' });
    }
    if (await hasActiveItemName(name)) {
      return res.status(409).json({ error: 'Item already exists.' });
    }
    if (image_data !== undefined && image_data !== null && !validImageData(image_data)) {
      return res.status(400).json({ error: 'image_data must be a JPEG image smaller than 1.5 MB' });
    }

    let id = parsed.id;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (parsed.auto) id = await nextItemId(prisma);
      try {
        const data = { id, name, description, unit_price };
        if (image_data) data.image_data = image_data;
        const item = await prisma.items.create({ data, select: itemFields });
        return res.status(201).json(item);
      } catch (err) {
        if (image_data && missingImageColumn(err)) {
          return res.status(503).json({ error: 'Item images are unavailable until the database migration is applied.' });
        }
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
    const { name, description, unit_price, image_data } = req.body;
    if (typeof name === 'string' && !name.trim()) {
      return res.status(400).json({ error: 'Item name is required' });
    }
    if (typeof name === 'string' && await hasActiveItemName(name, req.params.id)) {
      return res.status(409).json({ error: 'Item already exists.' });
    }
    const typed = req.body.id;
    if (typed !== undefined && typed !== null && String(typed).trim() !== '') {
      const parsed = parseItemId(typed);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      const current = await prisma.items.findUnique({
        select: { id: true },
        where: { item_id: req.params.id },
      });
      if (!current) return res.status(404).json({ error: 'Not found' });
      if (parsed.id !== current.id) {
        return res.status(400).json({ error: 'Item IDs cannot be changed after an item is created' });
      }
    }
    if (unit_price !== undefined && !validPrice(unit_price)) {
      return res.status(400).json({ error: 'unit_price must be 0 or more' });
    }
    if (image_data !== undefined && image_data !== null && !validImageData(image_data)) {
      return res.status(400).json({ error: 'image_data must be a JPEG image smaller than 1.5 MB' });
    }
    const item = await prisma.items.update({
      where: { item_id: req.params.id },
      data: { name, description, unit_price, ...(image_data !== undefined ? { image_data } : {}) },
      select: itemFields,
    });
    res.json(item);
  } catch (err) {
    if (req.body.image_data !== undefined && missingImageColumn(err)) {
      return res.status(503).json({ error: 'Item images are unavailable until the database migration is applied.' });
    }
    handleError(res, err);
  }
};

// "DELETE" = soft delete. The app role is not allowed to delete rows.
exports.deactivate = async (req, res) => {
  try {
    const item = await prisma.items.update({
      where: { item_id: req.params.id },
      data: { is_active: false },
      select: itemFields,
    });
    res.json(item);
  } catch (err) {
    handleError(res, err);
  }
};

exports.restore = async (req, res) => {
  try {
    const item = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE public.items IN ACCESS EXCLUSIVE MODE`;
      const current = await tx.items.findUnique({
        select: { id: true, is_active: true },
        where: { item_id: req.params.id },
      });
      if (!current) return null;
      if (!current.is_active) {
        const id = current.id.startsWith('ARCHIVED-') ? await nextItemId(tx) : current.id;
        await tx.items.update({
          where: { item_id: req.params.id },
          data: { id, is_active: true },
          select: itemFields,
        });
      }
      return tx.items.findUnique({
        select: itemFields,
        where: { item_id: req.params.id },
      });
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
      const item = await tx.items.findUnique({
        select: { is_active: true },
        where: { item_id: req.params.id },
      });
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
