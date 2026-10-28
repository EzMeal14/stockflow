require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('Set SEED_PASSWORD (8 or more characters) in .env');
  }
  const password_hash = await bcrypt.hash(password, 10);

  const users = [
    { email: 'admin@test.com',  firstname: 'Admin',  lastname: 'User', role: 'admin' },
    { email: 'client@test.com', firstname: 'Client', lastname: 'User', role: 'client' },
    { email: 'staff@test.com',  firstname: 'Staff',  lastname: 'User', role: 'staff',
      warehouse_id: '11111111-1111-1111-1111-111111111111' },
    { email: 'driver@test.com', firstname: 'Driver', lastname: 'User', role: 'driver' },
  ];

  for (const u of users) {
    await prisma.users.upsert({
      where: { email: u.email },
      update: { password_hash },
      create: { ...u, password_hash },
      select: { user_id: true },
    });
    console.log('Ready:', u.email, `(${u.role})`);
  }
}

main()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());