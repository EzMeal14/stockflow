const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');

// Active drivers, for the "assign a driver" list. Only the ID and the name are sent.
exports.drivers = async (req, res) => {
  try {
    const rows = await prisma.users.findMany({
      where: { role: 'driver', is_active: true },
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
