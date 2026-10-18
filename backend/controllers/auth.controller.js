const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');
const { signToken } = require('../lib/auth');

// Anyone can register, but only as a client. Staff, drivers and admins are made by an admin.
exports.register = async (req, res) => {
  try {
    const { firstname, lastname, email, password } = req.body;
    if (!firstname || !lastname || !email || !password || password.length < 8) {
      return res.status(400).json({
        error: 'firstname, lastname, email and a password of 8 or more characters are required',
      });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const user = await prisma.users.create({
      data: { firstname, lastname, email: email.toLowerCase(), password_hash, role: 'client' },
    });
    res.status(201).json({ user_id: user.user_id, email: user.email, role: user.role });
  } catch (err) {
    handleError(res, err);
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const user = await prisma.users.findUnique({ where: { email: email.toLowerCase() } });
    const ok = user && user.is_active && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    res.json({
      token: signToken(user),
      user: {
        user_id: user.user_id,
        firstname: user.firstname,
        lastname: user.lastname,
        role: user.role,
        warehouse_id: user.warehouse_id,
      },
    });
  } catch (err) {
    handleError(res, err);
  }
};