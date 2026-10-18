require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

app.get('/items', async (req, res) => {
  try {
    const items = await prisma.items.findMany();
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load items' });
  }
});

app.listen(3000, () => console.log('API running on http://localhost:3000'));