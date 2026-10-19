const prisma = require('./prisma');

// Runs the work in one transaction and tells the database who is acting.
// The audit triggers read this value to fill audit_logs.changed_by.
function withUser(userId, work) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return work(tx);
  });
}

module.exports = { withUser };