const express = require('express');

const app = express();
app.use(express.json());

app.use('/auth', require('./routes/auth.routes'));
app.use('/items', require('./routes/items.routes'));
app.use('/warehouses', require('./routes/warehouses.routes'));
app.use('/orders', require('./routes/orders.routes'));
app.use('/vehicles', require('./routes/vehicles.routes'));
app.use('/shipments', require('./routes/shipments.routes'));
app.use('/stock', require('./routes/stock.routes'));

// Unknown URL
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Last safety net: bad JSON and anything unexpected return JSON, never a crash page
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;