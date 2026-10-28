const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');
const { validPhotoData, missingPhotoColumn } = require('../lib/photo');

const WAREHOUSE_FIELDS = {
  warehouse_id: true,
  name: true,
  address: true,
  city: true,
  photo_data: true,
  is_active: true,
};
const WAREHOUSE_FIELDS_WITHOUT_PHOTO = { ...WAREHOUSE_FIELDS };
delete WAREHOUSE_FIELDS_WITHOUT_PHOTO.photo_data;

function photoUnavailable(res) {
  return res.status(503).json({ error: 'Photos are unavailable until the database migration is applied.' });
}

// A staff member may only use their own warehouse
function staffBlocked(req) {
  return req.user.role === 'staff' && req.params.id.toLowerCase() !== req.user.warehouse_id;
}

exports.list = async (req, res) => {
  try {
    const where = { is_active: true };
    if (req.user.role === 'staff') {
      if (!req.user.warehouse_id) {
        return res.status(403).json({ error: 'This staff account has no warehouse' });
      }
      where.warehouse_id = req.user.warehouse_id;
    }
    let rows;
    const fields = req.user.role === 'client'
      ? { warehouse_id: true, name: true, city: true }
      : WAREHOUSE_FIELDS;
    try {
      rows = await prisma.warehouses.findMany({ where, orderBy: { name: 'asc' }, select: fields });
    } catch (err) {
      if (!missingPhotoColumn(err) || req.user.role === 'client') throw err;
      rows = await prisma.warehouses.findMany({ where, orderBy: { name: 'asc' }, select: WAREHOUSE_FIELDS_WITHOUT_PHOTO });
    }
    // Clients only need the name and city to choose a warehouse
    if (req.user.role === 'client') {
      rows = rows.map(({ warehouse_id, name, city }) => ({ warehouse_id, name, city }));
    }
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};

exports.getOne = async (req, res) => {
  try {
    if (staffBlocked(req)) return res.status(403).json({ error: 'Not your warehouse' });
    let row;
    try {
      row = await prisma.warehouses.findUnique({
        where: { warehouse_id: req.params.id },
        select: WAREHOUSE_FIELDS,
      });
    } catch (err) {
      if (!missingPhotoColumn(err)) throw err;
      row = await prisma.warehouses.findUnique({
        where: { warehouse_id: req.params.id },
        select: WAREHOUSE_FIELDS_WITHOUT_PHOTO,
      });
    }
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    handleError(res, err);
  }
};

exports.create = async (req, res) => {
  try {
    const { name, address, city, photo_data } = req.body;
    if (!name || !address || !city) {
      return res.status(400).json({ error: 'name, address and city are required' });
    }
    if (photo_data !== undefined && photo_data !== null && !validPhotoData(photo_data)) {
      return res.status(400).json({ error: 'photo_data must be a JPEG image smaller than 1.5 MB' });
    }
    let row;
    try {
      row = await prisma.warehouses.create({
        data: { name, address, city, ...(photo_data !== undefined ? { photo_data } : {}) },
        select: WAREHOUSE_FIELDS,
      });
    } catch (err) {
      if (!missingPhotoColumn(err)) throw err;
      if (photo_data !== undefined && photo_data !== null) return photoUnavailable(res);
      row = await prisma.warehouses.create({
        data: { name, address, city },
        select: WAREHOUSE_FIELDS_WITHOUT_PHOTO,
      });
    }
    res.status(201).json(row);
  } catch (err) {
    handleError(res, err);
  }
};

exports.update = async (req, res) => {
  try {
    const { name, address, city, photo_data } = req.body;
    if (photo_data !== undefined && photo_data !== null && !validPhotoData(photo_data)) {
      return res.status(400).json({ error: 'photo_data must be a JPEG image smaller than 1.5 MB' });
    }
    let row;
    try {
      row = await prisma.warehouses.update({
        where: { warehouse_id: req.params.id },
        data: { name, address, city, ...(photo_data !== undefined ? { photo_data } : {}) },
        select: WAREHOUSE_FIELDS,
      });
    } catch (err) {
      if (!missingPhotoColumn(err)) throw err;
      if (photo_data !== undefined) return photoUnavailable(res);
      row = await prisma.warehouses.update({
        where: { warehouse_id: req.params.id },
        data: { name, address, city },
        select: WAREHOUSE_FIELDS_WITHOUT_PHOTO,
      });
    }
    res.json(row);
  } catch (err) {
    handleError(res, err);
  }
};

// Soft delete: the app role cannot delete rows
exports.deactivate = async (req, res) => {
  try {
    const row = await prisma.warehouses.update({
      where: { warehouse_id: req.params.id },
      data: { is_active: false },
      select: WAREHOUSE_FIELDS_WITHOUT_PHOTO,
    });
    res.json(row);
  } catch (err) {
    handleError(res, err);
  }
};

// Stock in one warehouse
exports.inventory = async (req, res) => {
  try {
    if (staffBlocked(req)) return res.status(403).json({ error: 'Not your warehouse' });
    const rows = await prisma.inventory.findMany({
      where: { warehouse_id: req.params.id },
    });
    res.json(rows);
  } catch (err) {
    handleError(res, err);
  }
};