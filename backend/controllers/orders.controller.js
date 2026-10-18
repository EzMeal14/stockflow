const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');

exports.list = async (req, res) => {
  try {
    const rows = await prisma.orders.findMany({ orderBy: { created_at: 'desc' } });
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};

exports.getOne = async (req, res) => {
  try {
    const order = await prisma.orders.findUnique({ where: { order_id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Not found' });
    const lines = await prisma.order_items.findMany({ where: { order_id: req.params.id } });
    res.json({ ...order, items: lines });
  } catch (err) {
    handleError(res, err);
  }
};

// Place an order: calls the place_order function in the database
exports.create = async (req, res) => {
  try {
    const { client_id, warehouse_id, delivery_address, items } = req.body;
    if (!client_id || !warehouse_id || !delivery_address || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'client_id, warehouse_id, delivery_address and a non-empty items list are required',
      });
    }
    const result = await prisma.$queryRaw`
      SELECT place_order(
        ${client_id}::uuid,
        ${warehouse_id}::uuid,
        ${delivery_address},
        ${JSON.stringify(items)}::jsonb
      ) AS order_id`;
    res.status(201).json({ order_id: result[0].order_id, status: 'pending' });
  } catch (err) {
    handleError(res, err);
  }
};

// Confirm an order: the database trigger deducts the stock
exports.confirm = async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    await prisma.$executeRaw`
      CALL confirm_order(${req.params.id}::uuid, ${user_id}::uuid)`;
    res.json({ order_id: req.params.id, status: 'confirmed' });
  } catch (err) {
    handleError(res, err);
  }
};