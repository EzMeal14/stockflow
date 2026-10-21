function handleError(res, err) {
  console.error(err);

  // Errors from Prisma's normal methods
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Duplicate value, for example the SKU already exists' });
  }
  if (err.code === 'P2003') {
    return res.status(409).json({ error: 'A linked record is missing or still in use' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (err.code === 'P2023') {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  // Errors from our database procedures and raw queries
  if (err.code === 'P2010') {
    const pg = err.meta && err.meta.code; // the PostgreSQL error code
    if (pg === '23503') {
      return res.status(409).json({ error: 'A linked record is missing or still in use' });
    }
    if (pg === '23505') {
      return res.status(409).json({ error: 'Duplicate value' });
    }
    if (pg === '23514') {
      return res.status(400).json({ error: 'A database rule rejected the value, for example a negative quantity' });
    }
    // Our own rules, like "Not enough stock"
    return res.status(400).json({
      error: (err.meta && err.meta.message) || 'The database rejected the request',
    });
  }

  // A CHECK rule hit through a normal Prisma call
  if (String(err.message).includes('violates check constraint')) {
    return res.status(400).json({ error: 'A database rule rejected the value, for example a negative quantity' });
  }

  return res.status(500).json({ error: 'Server error' });
}

module.exports = { handleError };