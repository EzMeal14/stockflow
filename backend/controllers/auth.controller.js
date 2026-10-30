const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');
const { signToken } = require('../lib/auth');
const { validPhotoData, missingPhotoColumn } = require('../lib/photo');

// Anyone can register, but only as a client. Staff, drivers and admins are made by an admin.
exports.register = async (req, res) => {
  try {
    const { firstname, lastname, email, password } = req.body;
    const rawEmail = String(email || '');
    const normalizedEmail = rawEmail.trim().toLowerCase();
    const passwordString = typeof password === 'string' ? password : '';
    if (!firstname || !lastname || !normalizedEmail || !passwordString
      || normalizedEmail.length > 254 || /\s/.test(rawEmail)
      || passwordString.length < 8 || /\s/.test(passwordString)) {
      return res.status(400).json({
        error: 'Email and password cannot contain spaces, and the password must have 8 or more characters',
      });
    }
    const password_hash = await bcrypt.hash(passwordString, 10);
    const user = await prisma.users.create({
      data: { firstname, lastname, email: normalizedEmail, password_hash, role: 'client' },
      select: { user_id: true, email: true, role: true },
    });
    res.status(201).json({ user_id: user.user_id, email: user.email, role: user.role });
  } catch (err) {
    handleError(res, err);
  }
};

async function sendCode(email, code, subject, purpose) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Password reset email is not configured');
  const from = process.env.RESEND_FROM || 'BuildStock <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      text: `Your BuildStock ${purpose} is ${code}. It expires in 10 minutes.`,
    }),
  });
  if (!response.ok) throw new Error('Could not send password reset email');
}

exports.forgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const genericMessage = 'If that email is registered, a verification code was sent.';
    const user = await prisma.users.findFirst({
      where: { email, is_active: true },
      select: { user_id: true },
    });
    if (!user) return res.json({ message: genericMessage });

    const code = String(crypto.randomInt(100000, 1000000));
    const code_hash = crypto.createHash('sha256').update(code).digest('hex');
    await prisma.password_resets.deleteMany({ where: { user_id: user.user_id } });
    await prisma.password_resets.create({
      data: { user_id: user.user_id, code_hash, expires_at: new Date(Date.now() + 10 * 60 * 1000) },
    });
    try {
      await sendCode(email, code, 'Your BuildStock password reset code', 'password reset code');
    } catch (err) {
      await prisma.password_resets.deleteMany({ where: { user_id: user.user_id } });
      throw err;
    }
    res.json({ message: genericMessage });
  } catch (err) {
    handleError(res, err);
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '');
    const password = String(req.body.password || '');
    if (!email || !/^\d{6}$/.test(code) || password.length < 8 || /\s/.test(password)) {
      return res.status(400).json({ error: 'Enter a valid code and a password of at least 8 characters without spaces' });
    }
    const code_hash = crypto.createHash('sha256').update(code).digest('hex');
    const reset = await prisma.password_resets.findFirst({
      where: { code_hash, expires_at: { gt: new Date() }, users: { email, is_active: true } },
      select: { reset_id: true, user_id: true },
    });
    if (!reset) return res.status(400).json({ error: 'Invalid or expired verification code' });

    await prisma.$transaction([
      prisma.users.update({
        where: { user_id: reset.user_id },
        data: { password_hash: await bcrypt.hash(password, 10) },
      }),
      prisma.password_resets.deleteMany({ where: { user_id: reset.user_id } }),
    ]);
    res.json({ message: 'Password changed successfully. You can sign in now.' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.me = async (req, res) => {
  try {
    const select = { firstname: true, lastname: true, email: true, role: true, contact_number: true };
    if (['admin', 'driver', 'staff', 'client'].includes(req.user.role)) select.photo_data = true;
    const user = await prisma.users.findUnique({
      where: { user_id: req.user.user_id },
      select,
    });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    res.json(user);
  } catch (err) {
    if (missingPhotoColumn(err)) {
      console.warn('Database migration for profile photos is not applied; returning profile without photo.');
      const user = await prisma.users.findUnique({
        where: { user_id: req.user.user_id },
        select: { firstname: true, lastname: true, email: true, role: true, contact_number: true },
      });
      if (!user) return res.status(404).json({ error: 'Account not found' });
      return res.json(user);
    }
    handleError(res, err);
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const firstname = typeof req.body.firstname === 'string' ? req.body.firstname.trim() : undefined;
    const lastname = typeof req.body.lastname === 'string' ? req.body.lastname.trim() : undefined;
    const contact_number = typeof req.body.contact_number === 'string' ? req.body.contact_number.trim() : undefined;
    const hasPhotoChange = Object.prototype.hasOwnProperty.call(req.body, 'photo_data');
    const hasNameChange = firstname !== undefined || lastname !== undefined;
    const currentPassword = typeof req.body.current_password === 'string' ? req.body.current_password : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (hasPhotoChange && !['admin', 'driver', 'staff', 'client'].includes(req.user.role)) {
      return res.status(403).json({ error: 'This account cannot update a profile photo' });
    }
    if (hasPhotoChange && req.body.photo_data !== null && !validPhotoData(req.body.photo_data)) {
      return res.status(400).json({ error: 'photo_data must be a JPEG image smaller than 1.5 MB' });
    }
    if (contact_number !== undefined && contact_number.length > 20) {
      return res.status(400).json({ error: 'Contact number must be 20 characters or fewer' });
    }
    if (firstname !== undefined && (!firstname || firstname.length > 200)) {
      return res.status(400).json({ error: 'First name is required and must be 200 characters or fewer' });
    }
    if (lastname !== undefined && (!lastname || lastname.length > 200)) {
      return res.status(400).json({ error: 'Last name is required and must be 200 characters or fewer' });
    }
    const changingPassword = Boolean(password);
    if (changingPassword && (password.length < 8 || /\s/.test(password) || !currentPassword)) {
      return res.status(400).json({ error: 'Enter the current password and a new password of at least 8 characters without spaces' });
    }
    const user = await prisma.users.findUnique({
      where: { user_id: req.user.user_id },
      select: { user_id: true, password_hash: true },
    });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (changingPassword && !(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const data = {};
    if (firstname !== undefined) data.firstname = firstname;
    if (lastname !== undefined) data.lastname = lastname;
    if (contact_number !== undefined) data.contact_number = contact_number || null;
    if (changingPassword) data.password_hash = await bcrypt.hash(password, 10);
    if (hasPhotoChange) data.photo_data = req.body.photo_data;
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Enter a change to save' });
    try {
      await prisma.users.update({
        where: { user_id: req.user.user_id },
        data,
        select: { user_id: true },
      });
    } catch (err) {
      if (hasPhotoChange && missingPhotoColumn(err)) {
        return res.status(503).json({ error: 'Profile photos are unavailable until the database migration is applied.' });
      }
      throw err;
    }
    const message = hasPhotoChange || hasNameChange
      ? 'Profile updated.'
      : changingPassword
        ? 'Password changed successfully.'
        : 'Contact number updated.';
    res.json({ message });
  } catch (err) { handleError(res, err); }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const user = await prisma.users.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        user_id: true,
        firstname: true,
        lastname: true,
        email: true,
        password_hash: true,
        role: true,
        warehouse_id: true,
        is_active: true,
      },
    });
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
