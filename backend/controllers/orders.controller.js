const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');

// Which orders may this user see? Returns a Prisma "where" filter, or null for no access.
async function orderScope(user) {
  if (user.role === 'admin') return {};
  if (user.role === 'client') return { client_id: user.user_id };
  if (user.role === 'staff') {
    return user.warehouse_id ? { warehouse_id: user.warehouse_id } : null;
  }
  if (user.role === 'driver') {
    const ships = await prisma.shipments.findMany({
      where: { driver_id: user.user_id },
      select: { order_id: true },
    });
    return { order_id: { in: ships.map((s) => s.order_id) } };
  }
  return null;
}

exports.list = async (req, res) => {
  try {
    const scope = await orderScope(req.user);
    if (!scope) return res.status(403).json({ error: 'No access to orders' });
    const rows = await prisma.orders.findMany({
      where: scope,
      orderBy: { created_at: 'desc' },
    });
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};

exports.getOne = async (req, res) => {
  try {
    const scope = await orderScope(req.user);
    if (!scope) return res.status(403).json({ error: 'No access to orders' });
    // Someone else's order looks the same as a missing order
    const order = await prisma.orders.findFirst({
      where: { AND: [scope, { order_id: req.params.id }] },
    });
    if (!order) return res.status(404).json({ error: 'Not found' });
    let lines = await prisma.order_items.findMany({ where: { order_id: order.order_id } });
    // Warehouse staff must not see prices
    if (req.user.role === 'staff') {
      lines = lines.map(({ unit_price, ...rest }) => rest);
    }
    res.json({ ...order, items: lines });
  } catch (err) {
    handleError(res, err);
  }
};

// Place an order: calls the place_order function in the database
exports.create = async (req, res) => {
  try {
    const { warehouse_id, delivery_address, items } = req.body;
    // A client always orders for themselves. An admin may order for a client.
    const client_id = req.user.role === 'client' ? req.user.user_id : req.body.client_id;
    if (!client_id || !warehouse_id || !delivery_address || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'warehouse_id, delivery_address and a non-empty items list are required',
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
    const scope = await orderScope(req.user);
    if (!scope) return res.status(403).json({ error: 'No access to orders' });
    const order = await prisma.orders.findFirst({
      where: { AND: [scope, { order_id: req.params.id }] },
    });
    if (!order) return res.status(404).json({ error: 'Not found' });
    await prisma.$executeRaw`
      CALL confirm_order(${order.order_id}::uuid, ${req.user.user_id}::uuid)`;
    res.json({ order_id: order.order_id, status: 'confirmed' });
  } catch (err) {
    handleError(res, err);
  }
};