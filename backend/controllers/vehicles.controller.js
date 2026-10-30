const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');
const { withUser } = require('../lib/audit');

exports.list = async (req, res) => {
  try {
    const rows = await prisma.vehicles.findMany({
      where: { is_active: true },
      orderBy: { plate: 'asc' },
    });
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};

exports.listInactive = async (req, res) => {
  try {
    const rows = await prisma.vehicles.findMany({
      where: { is_active: false },
      orderBy: { plate: 'asc' },
    });
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};

exports.create = async (req, res) => {
  try {
    const { plate, type } = req.body;
    if (!plate || !type) {
      return res.status(400).json({ error: 'plate and type are required' });
    }
    const row = await prisma.vehicles.create({ data: { plate, type } });
    res.status(201).json(row);
  } catch (err) {
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const { plate, type } = req.body;
    const row = await prisma.vehicles.update({
      where: { vehicle_id: req.params.id },
      data: { plate, type },
    });
    res.json(row);
  } catch (err) {
    handleError(res, err);
  }
};

// Soft delete: the app role cannot delete rows
exports.deactivate = async (req, res) => {
  try {
    const row = await prisma.vehicles.update({
      where: { vehicle_id: req.params.id },
      data: { is_active: false },
    });
    res.json(row);
  } catch (err) {
    handleError(res, err);
  }
};

exports.restore = async (req, res) => {
  try {
    const row = await prisma.vehicles.update({
      where: { vehicle_id: req.params.id },
      data: { is_active: true },
    });
    res.json(row);
  } catch (err) {
    handleError(res, err);
  }
};