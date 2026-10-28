const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');
const { withUser } = require('../lib/audit');

// Allowed status changes
const NEXT = { assigned: ['in_transit'], in_transit: ['delivered', 'failed'] };

// Which shipments may this user see? Returns a Prisma "where" filter, or null for no access.
async function shipmentScope(user) {
  if (user.role === 'admin') return {};
  if (user.role === 'driver') return { driver_id: user.user_id };
  if (user.role === 'staff') {
    if (!user.warehouse_id) return null;
    const orders = await prisma.orders.findMany({
      where: { warehouse_id: user.warehouse_id },
      select: { order_id: true },
    });
    return { order_id: { in: orders.map((o) => o.order_id) } };
  }
  return null;
}

exports.list = async (req, res) => {
  try {
    const scope = await shipmentScope(req.user);
    if (!scope) return res.status(403).json({ error: 'No access to shipments' });
    const rows = await prisma.shipments.findMany({ where: scope });
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};

exports.getOne = async (req, res) => {
  try {
    const scope = await shipmentScope(req.user);
    if (!scope) return res.status(403).json({ error: 'No access to shipments' });
    const row = await prisma.shipments.findFirst({
      where: { AND: [scope, { shipment_id: req.params.id }] },
    });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    handleError(res, err);
  }
};

// Create a shipment for a confirmed order
exports.create = async (req, res) => {
  try {
    const { order_id, driver_id, vehicle_id } = req.body;
    if (!order_id || !driver_id || !vehicle_id) {
      return res.status(400).json({ error: 'order_id, driver_id and vehicle_id are required' });
    }
    const order = await prisma.orders.findUnique({ where: { order_id } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (req.user.role === 'staff' && order.warehouse_id !== req.user.warehouse_id) {
      return res.status(403).json({ error: 'Not your warehouse' });
    }
    if (order.status !== 'confirmed') {
      return res.status(400).json({ error: 'Only confirmed orders can be shipped' });
    }
    const driver = await prisma.users.findUnique({ where: { user_id: driver_id } });
    if (!driver || driver.role !== 'driver' || !driver.is_active) {
      return res.status(400).json({ error: 'driver_id must be an active driver' });
    }
    const vehicle = await prisma.vehicles.findUnique({ where: { vehicle_id } });
    if (!vehicle || !vehicle.is_active) {
      return res.status(400).json({ error: 'vehicle_id must be an active vehicle' });
    }
    const shipment = await withUser(req.user.user_id, async (tx) => {
      const busyFilter = { status: { in: ['assigned', 'in_transit'] } };
      const [activeDriver, activeVehicle] = await Promise.all([
        tx.shipments.findFirst({ where: { driver_id, ...busyFilter } }),
        tx.shipments.findFirst({ where: { vehicle_id, ...busyFilter } }),
      ]);
      if (activeDriver) {
        const error = new Error('This driver already has an active shipment');
        error.code = 'P2010';
        error.meta = { code: 'P0001', message: error.message };
        throw error;
      }
      if (activeVehicle) {
        const error = new Error('This vehicle is already assigned to an active shipment');
        error.code = 'P2010';
        error.meta = { code: 'P0001', message: error.message };
        throw error;
      }
      return tx.shipments.create({ data: { order_id, driver_id, vehicle_id } });
    });
    res.status(201).json(shipment);
  } catch (err) {
    handleError(res, err);
  }
};

// Driver (or admin) moves the shipment forward. The order status follows it.
exports.updateStatus = async (req, res) => {
  try {
    const scope = await shipmentScope(req.user);
    if (!scope) return res.status(403).json({ error: 'No access to shipments' });
    const shipment = await prisma.shipments.findFirst({
      where: { AND: [scope, { shipment_id: req.params.id }] },
    });
    if (!shipment) return res.status(404).json({ error: 'Not found' });

    const { status } = req.body;
    if (!(NEXT[shipment.status] || []).includes(status)) {
      return res.status(400).json({ error: `Cannot change from ${shipment.status} to ${status}` });
    }

    const data = { status };
    if (status === 'in_transit') data.dispatched_at = new Date();
    if (status === 'delivered') data.delivered_at = new Date();

    const updated = await withUser(req.user.user_id, async (tx) => {
      const s = await tx.shipments.update({
        where: { shipment_id: shipment.shipment_id },
        data,
      });
      if (status === 'in_transit') {
        await tx.orders.update({ where: { order_id: shipment.order_id }, data: { status: 'dispatched' } });
      }
      if (status === 'delivered') {
        await tx.orders.update({ where: { order_id: shipment.order_id }, data: { status: 'delivered' } });
      }
      return s;
    });
    res.json(updated);
  } catch (err) {
    handleError(res, err);
  }
};