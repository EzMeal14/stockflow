const express = require('express');

const app = express();
app.use(express.json());

app.use('/items', require('./routes/items.routes'));

module.exports = app;