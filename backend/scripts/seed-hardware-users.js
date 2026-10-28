// Makes the sample staff, drivers and clients for the hardware distributor.
// Run AFTER database/09_hardware_sample_data.sql and backend/scripts/seed-users.js:
//   cd backend
//   node scripts/seed-hardware-users.js
//
// All accounts use the password in SEED_PASSWORD (.env). No password is stored in this file.
// Safe to run more than once: it updates the accounts that already exist.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { cleanContactNumber } = require('../lib/phone');

// One staff member for each warehouse (the warehouse names come from the SQL file)
const STAFF = [
  { email: 'staff.main@cebubuild.test',   firstname: 'Maria', lastname: 'Santos',    contact: '09171230001', warehouse: 'VisayasBuild Main Warehouse' },
  { email: 'staff.bogo@cebubuild.test',   firstname: 'Jose',  lastname: 'Reyes',     contact: '09171230002', warehouse: 'VisayasBuild Bogo Warehouse' },
  { email: 'staff.toledo@cebubuild.test', firstname: 'Ana',   lastname: 'Dela Cruz', contact: '09171230003', warehouse: 'VisayasBuild Toledo Warehouse' },
  { email: 'staff.carcar@cebubuild.test', firstname: 'Pedro', lastname: 'Garcia',    contact: '09171230004', warehouse: 'VisayasBuild Carcar Warehouse' },
];

const DRIVERS = [
  { email: 'driver1@cebubuild.test', firstname: 'Ramon',  lastname: 'Bautista',   contact: '09181230001' },
  { email: 'driver2@cebubuild.test', firstname: 'Luis',   lastname: 'Villanueva', contact: '09181230002' },
  { email: 'driver3@cebubuild.test', firstname: 'Carlo',  lastname: 'Mendoza',    contact: '09181230003' },
  { email: 'driver4@cebubuild.test', firstname: 'Rico',   lastname: 'Aquino',     contact: '09181230004' },
];

// (The email addresses keep the older "cebubuild.test" name on purpose, so accounts made
// by an earlier version of this script keep working.)
// Clients are the hardware stores and contractors that order from the warehouses
const CLIENTS = [
  { email: 'client1@cebubuild.test', firstname: 'Santos', lastname: 'Hardware Store' },
  { email: 'client2@cebubuild.test', firstname: 'Reyes',  lastname: 'Construction Supply' },
  { email: 'client3@cebubuild.test', firstname: 'Lim',    lastname: 'Builders Depot' },
  { email: 'client4@cebubuild.test', firstname: 'Tan',    lastname: 'Home Center' },
];

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('Set SEED_PASSWORD (8 or more characters) in .env');
  }
  const password_hash = await bcrypt.hash(password, 10);

  // Find the warehouses made by the SQL file
  const warehouseIds = {};
  for (const s of STAFF) {
    if (warehouseIds[s.warehouse]) continue;
    const w = await prisma.warehouses.findFirst({
      where: { name: s.warehouse, is_active: true },
      select: { warehouse_id: true },
    });
    if (!w) {
      throw new Error('Warehouse "' + s.warehouse + '" not found. Run database/09_hardware_sample_data.sql first.');
    }
    warehouseIds[s.warehouse] = w.warehouse_id;
  }

  const people = [
    ...STAFF.map((u) => ({ ...u, role: 'staff', warehouse_id: warehouseIds[u.warehouse] })),
    ...DRIVERS.map((u) => ({ ...u, role: 'driver' })),
    ...CLIENTS.map((u) => ({ ...u, role: 'client' })),
  ];

  for (const p of people) {
    const data = { firstname: p.firstname, lastname: p.lastname, role: p.role, is_active: true };
    if (p.warehouse_id) data.warehouse_id = p.warehouse_id;
    if (p.contact) {
      const contact_number = cleanContactNumber(p.contact);
      if (!contact_number) throw new Error('Bad contact number for ' + p.email);
      data.contact_number = contact_number;
    }
    await prisma.users.upsert({
      where: { email: p.email },
      update: { ...data, password_hash },
      create: { ...data, email: p.email, password_hash },
      select: { user_id: true },
    });
    console.log('Ready:', p.email, '(' + p.role + ')');
  }

  // The older test logins keep working: staff@test.com now works in the main warehouse
  await prisma.users.updateMany({
    where: { email: 'staff@test.com' },
    data: { warehouse_id: warehouseIds['VisayasBuild Main Warehouse'], contact_number: '09171239999' },
  });
  await prisma.users.updateMany({
    where: { email: 'driver@test.com' },
    data: { contact_number: '09181239999' },
  });
  console.log('Moved staff@test.com to VisayasBuild Main Warehouse.');
}

main()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
