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

module.exports = app;