function handleError(res, err) {
  console.error(err);
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Duplicate value, for example the SKU already exists' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Not found' });
  }
  if (err.code === 'P2023') {
    return res.status(400).json({ error: 'Invalid ID' });
  }
  // A rule inside the database rejected the request (stock check, constraint, procedure)
  if (err.code === 'P2010') {
    return res.status(400).json({ error: (err.meta && err.meta.message) || 'The database rejected the request' });
  }
  return res.status(500).json({ error: 'Server error' });
}

module.exports = { handleError };