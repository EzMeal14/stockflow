const express = require('express');
const cors = require('cors');

const app = express();

// Only these pages may call the API from a browser.
// 127.0.0.1 and localhost count as different origins, so both are listed.
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://127.0.0.1:5500,http://localhost:5500')
  .split(',')
  .map((s) => s.trim());

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.use('/auth', require('./routes/auth.routes'));
app.use('/items', require('./routes/items.routes'));
app.use('/warehouses', require('./routes/warehouses.routes'));
app.use('/orders', require('./routes/orders.routes'));
app.use('/vehicles', require('./routes/vehicles.routes'));
app.use('/shipments', require('./routes/shipments.routes'));
app.use('/stock', require('./routes/stock.routes'));
app.use('/lookups', require('./routes/lookups.routes'));
app.use('/drivers', require('./routes/drivers.routes'));
app.use('/staff', require('./routes/staff.routes'));

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
