const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');

function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

function sameWarehouse(a, b) {
  return a && b && String(a).toLowerCase() === String(b).toLowerCase();
}

// Add stock: calls the restock_stock procedure in the database
exports.restock = async (req, res) => {
  try {
    const { warehouse_id, item_id } = req.body;
    const quantity = Number(req.body.quantity);
    if (!warehouse_id || !item_id || !isPositiveInt(quantity)) {
      return res.status(400).json({ error: 'warehouse_id, item_id and a whole-number quantity above 0 are required' });
    }
    if (req.user.role === 'staff' && !sameWarehouse(warehouse_id, req.user.warehouse_id)) {
      return res.status(403).json({ error: 'Not your warehouse' });
    }
    await prisma.$executeRaw`
      CALL restock_stock(${warehouse_id}::uuid, ${item_id}::uuid, ${quantity}::int, ${req.user.user_id}::uuid)`;
    const row = await prisma.inventory.findFirst({ where: { warehouse_id, item_id } });
    res.status(201).json(row);
  } catch (err) {
    handleError(res, err);
  }
};

// Move stock between warehouses: calls the transfer_stock procedure
exports.transfer = async (req, res) => {
  try {
    const { from_warehouse_id, to_warehouse_id, item_id } = req.body;
    const quantity = Number(req.body.quantity);
    if (!from_warehouse_id || !to_warehouse_id || !item_id || !isPositiveInt(quantity)) {
      return res.status(400).json({
        error: 'from_warehouse_id, to_warehouse_id, item_id and a whole-number quantity above 0 are required',
      });
    }
    // Staff may only send stock OUT of their own warehouse
    if (req.user.role === 'staff' && !sameWarehouse(from_warehouse_id, req.user.warehouse_id)) {
      return res.status(403).json({ error: 'Not your warehouse' });
    }
    await prisma.$executeRaw`
      CALL transfer_stock(
        ${from_warehouse_id}::uuid, ${to_warehouse_id}::uuid, ${item_id}::uuid,
        ${quantity}::int, ${req.user.user_id}::uuid)`;
    const rows = await prisma.inventory.findMany({
      where: { item_id, warehouse_id: { in: [from_warehouse_id, to_warehouse_id] } },
    });
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};

// Low-stock report (reads the v_low_stock view). Staff see only their own warehouse.
exports.lowStock = async (req, res) => {
  try {
    let warehouse = null;
    if (req.user.role === 'staff') {
      if (!req.user.warehouse_id) {
        return res.status(403).json({ error: 'This staff account has no warehouse' });
      }
      warehouse = req.user.warehouse_id;
    }
    const rows = await prisma.$queryRaw`
      SELECT * FROM v_low_stock
      WHERE (${warehouse}::uuid IS NULL OR warehouse_id = ${warehouse}::uuid)
      ORDER BY warehouse, item`;
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};

// Stock history (the 50 newest movements). Staff see only their own warehouse.
exports.movements = async (req, res) => {
  try {
    let warehouse = req.query.warehouse_id || null;
    if (req.user.role === 'staff') {
      if (!req.user.warehouse_id) {
        return res.status(403).json({ error: 'This staff account has no warehouse' });
      }
      warehouse = req.user.warehouse_id;
    }
    const rows = await prisma.$queryRaw`
      SELECT m.movement_id, m.movement_type, m.quantity_change, m.created_at,
             m.performed_by, u.firstname || ' ' || u.lastname AS performed_by_name,
             i.warehouse_id, i.item_id
      FROM stock_movements m
      JOIN inventory i ON i.inventory_id = m.inventory_id
      JOIN users u ON u.user_id = m.performed_by
      WHERE (${warehouse}::uuid IS NULL OR i.warehouse_id = ${warehouse}::uuid)
      ORDER BY m.created_at DESC
      LIMIT 50`;
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};