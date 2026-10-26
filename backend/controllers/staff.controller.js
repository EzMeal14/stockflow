const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');
const { withUser } = require('../lib/audit');
const { cleanContactNumber, CONTACT_ERROR } = require('../lib/phone');

const PUBLIC_FIELDS = { user_id: true, firstname: true, lastname: true, email: true, warehouse_id: true, contact_number: true };

// Active staff, each with the name of their warehouse. Password hashes are never sent.
exports.list = async (req, res) => {
  try {
    const rows = await prisma.users.findMany({
      where: { role: 'staff', is_active: true },
      select: PUBLIC_FIELDS,
      orderBy: { firstname: 'asc' },
    });
    const warehouses = await prisma.warehouses.findMany({
      where: { warehouse_id: { in: rows.map((r) => r.warehouse_id).filter(Boolean) } },
      select: { warehouse_id: true, name: true, city: true },
    });
    const byId = Object.fromEntries(warehouses.map((w) => [w.warehouse_id, w]));
    res.json(rows.map((r) => {
      const w = byId[r.warehouse_id];
      return { ...r, warehouse_name: w ? w.name + ' (' + w.city + ')' : '' };
    }));
  } catch (err) {
    handleError(res, err);
  }
};

// Add a staff account. The role is always "staff". A staff member needs a warehouse,
// because staff only see the orders, shipments and stock of their own warehouse.
// The change is logged with the admin's ID.
exports.create = async (req, res) => {
  try {
    const firstname = String(req.body.firstname || '').trim();
    const lastname = String(req.body.lastname || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = req.body.password;
    const warehouse_id = String(req.body.warehouse_id || '').trim();
    if (!firstname || !lastname || !email || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        error: 'firstname, lastname, email and a password of 8 or more characters are required',
      });
    }
    const contact_number = cleanContactNumber(req.body.contact_number);
    if (!contact_number) {
      return res.status(400).json({ error: CONTACT_ERROR });
    }
    if (!warehouse_id) {
      return res.status(400).json({ error: 'Choose a warehouse for this staff member' });
    }
    const warehouse = await prisma.warehouses.findFirst({ where: { warehouse_id, is_active: true } });
    if (!warehouse) {
      return res.status(400).json({ error: 'warehouse_id must be an active warehouse' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const staff = await withUser(req.user.user_id, (tx) =>
      tx.users.create({
        data: { firstname, lastname, email, password_hash, contact_number, role: 'staff', warehouse_id },
        select: PUBLIC_FIELDS,
      })
    );
    res.status(201).json(staff);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'That email is already used' });
    }
    handleError(res, err);
  }
};

// Remove a staff member = switch the account off. Rows are never deleted, so old records keep their name.
exports.remove = async (req, res) => {
  try {
    const staff = await prisma.users.findFirst({
      where: { user_id: req.params.id, role: 'staff', is_active: true },
    });
    if (!staff) return res.status(404).json({ error: 'Staff member not found' });

    await withUser(req.user.user_id, (tx) =>
      tx.users.update({ where: { user_id: staff.user_id }, data: { is_active: false } })
    );
    res.json({ user_id: staff.user_id, removed: true });
  } catch (err) {
    handleError(res, err);
  }
};
