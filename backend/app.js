const express = require('express');

const app = express();
app.use(express.json());

app.use('/items', require('./routes/items.routes'));
app.use('/warehouses', require('./routes/warehouses.routes'));
app.use('/orders', require('./routes/orders.routes'));

module.exports = app;