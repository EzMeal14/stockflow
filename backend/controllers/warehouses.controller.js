const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');

// A staff member may only use their own warehouse
function staffBlocked(req) {
  return req.user.role === 'staff' && req.params.id.toLowerCase() !== req.user.warehouse_id;
}

exports.list = async (req, res) => {
  try {
    const where = { is_active: true };
    if (req.user.role === 'staff') {
      if (!req.user.warehouse_id) {
        return res.status(403).json({ error: 'This staff account has no warehouse' });
      }
      where.warehouse_id = req.user.warehouse_id;
    }
    let rows = await prisma.warehouses.findMany({ where, orderBy: { name: 'asc' } });
    // Clients only need the name and city to choose a warehouse
    if (req.user.role === 'client') {
      rows = rows.map(({ warehouse_id, name, city }) => ({ warehouse_id, name, city }));
    }
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};

exports.getOne = async (req, res) => {
  try {
    if (staffBlocked(req)) return res.status(403).json({ error: 'Not your warehouse' });
    const row = await prisma.warehouses.findUnique({ where: { warehouse_id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    handleError(res, err);
  }
};

exports.create = async (req, res) => {
  try {
    const { name, address, city } = req.body;
    if (!name || !address || !city) {
      return res.status(400).json({ error: 'name, address and city are required' });
    }
    const row = await prisma.warehouses.create({ data: { name, address, city } });
    res.status(201).json(row);
  } catch (err) {
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const { name, address, city } = req.body;
    const row = await prisma.warehouses.update({
      where: { warehouse_id: req.params.id },
      data: { name, address, city },
    });
    res.json(row);
  } catch (err) {
    handleError(res, err);
  }
};

// Soft delete: the app role cannot delete rows
exports.deactivate = async (req, res) => {
  try {
    const row = await prisma.warehouses.update({
      where: { warehouse_id: req.params.id },
      data: { is_active: false },
    });
    res.json(row);
  } catch (err) {
    handleError(res, err);
  }
};

// Stock in one warehouse
exports.inventory = async (req, res) => {
  try {
    if (staffBlocked(req)) return res.status(403).json({ error: 'Not your warehouse' });
    const rows = await prisma.inventory.findMany({
      where: { warehouse_id: req.params.id },
    });
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};