const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');
const { withUser } = require('../lib/audit');

const OPEN_STATUSES = ['assigned', 'in_transit'];
const PUBLIC_FIELDS = { user_id: true, firstname: true, lastname: true, email: true };

// Active drivers
exports.list = async (req, res) => {
  try {
    const rows = await prisma.users.findMany({
      where: { role: 'driver', is_active: true },
      select: PUBLIC_FIELDS,
      orderBy: { firstname: 'asc' },
    });
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};

// Add a driver account. The role is always "driver". The change is logged with the admin's ID.
exports.create = async (req, res) => {
  try {
    const firstname = String(req.body.firstname || '').trim();
    const lastname = String(req.body.lastname || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password;
    if (!firstname || !lastname || !email || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        error: 'firstname, lastname, email and a password of 8 or more characters are required',
      });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const driver = await withUser(req.user.user_id, (tx) =>
      tx.users.create({
        data: { firstname, lastname, email, password_hash, role: 'driver' },
        select: PUBLIC_FIELDS,
      })
    );
    res.status(201).json(driver);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'That email is already used' });
    }
    handleError(res, err);
  }
};

// Remove a driver = switch the account off. Rows are never deleted, so old shipments keep their driver.
exports.remove = async (req, res) => {
  try {
    const driver = await prisma.users.findFirst({
      where: { user_id: req.params.id, role: 'driver', is_active: true },
    });
    if (!driver) return res.status(404).json({ error: 'Driver not found' });

    const open = await prisma.shipments.count({
      where: { driver_id: driver.user_id, status: { in: OPEN_STATUSES } },
    });
    if (open > 0) {
      return res.status(409).json({ error: 'This driver still has open shipments' });
    }

    await withUser(req.user.user_id, (tx) =>
      tx.users.update({ where: { user_id: driver.user_id }, data: { is_active: false } })
    );
    res.json({ user_id: driver.user_id, removed: true });
  } catch (err) {
    handleError(res, err);
  }
};
