const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');

// Active drivers, for the "assign a driver" list. Only the ID and the name are sent.
exports.drivers = async (req, res) => {
  try {
    const rows = await prisma.users.findMany({
      where: { role: 'driver', is_active: true, is_available: true },
      select: { user_id: true, firstname: true, lastname: true },
      orderBy: { firstname: 'asc' },
    });
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};

// Active warehouses (name and city only), for the "transfer to" list.
// Staff can only see their own warehouse in /warehouses, so they need this list.
exports.warehouses = async (req, res) => {
  try {
    const rows = await prisma.warehouses.findMany({
      where: { is_active: true },
      select: { warehouse_id: true, name: true, city: true },
      orderBy: { name: 'asc' },
    });
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};

// How many units of each item are in ONE warehouse. Used by the client order form.
// Only the item and the number are sent. No reorder level, no history, no other warehouse.
exports.availability = async (req, res) => {
  try {
    const warehouse_id = req.query.warehouse_id;
    if (!warehouse_id) {
      return res.status(400).json({ error: 'warehouse_id is required' });
    }
    const rows = await prisma.inventory.findMany({
      where: { warehouse_id: String(warehouse_id) },
      select: { item_id: true, quantity: true },
    });
    res.json(rows.map((r) => ({ item_id: r.item_id, available: r.quantity })));
  } catch (err) {
    handleError(res, err);
  }
};
