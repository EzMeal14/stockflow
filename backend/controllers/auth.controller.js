const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');
const { signToken } = require('../lib/auth');

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
    const user = await prisma.users.findUnique({
      where: { user_id: req.user.user_id },
      select: { email: true, role: true, contact_number: true },
    });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    res.json(user);
  } catch (err) { handleError(res, err); }
};

exports.updateProfile = async (req, res) => {
  try {
    const contact_number = typeof req.body.contact_number === 'string' ? req.body.contact_number.trim() : undefined;
    const currentPassword = typeof req.body.current_password === 'string' ? req.body.current_password : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (contact_number !== undefined && contact_number.length > 20) {
      return res.status(400).json({ error: 'Contact number must be 20 characters or fewer' });
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
    if (contact_number !== undefined) data.contact_number = contact_number || null;
    if (changingPassword) data.password_hash = await bcrypt.hash(password, 10);
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Enter a change to save' });
    await prisma.users.update({
      where: { user_id: req.user.user_id },
      data,
      select: { user_id: true },
    });
    res.json({ message: changingPassword ? 'Password changed successfully.' : 'Contact number updated.' });
  } catch (err) { handleError(res, err); }
};

exports.requestEmailChange = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const currentPassword = String(req.body.current_password || '');
    if (!email || email.length > 254 || /\s/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address without spaces' });
    }
    const user = await prisma.users.findUnique({
      where: { user_id: req.user.user_id },
      select: { user_id: true, email: true, password_hash: true },
    });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (email === user.email) return res.status(400).json({ error: 'Enter a different email address' });
    if (await prisma.users.findUnique({ where: { email }, select: { user_id: true } })) {
      return res.status(409).json({ error: 'That email is already registered' });
    }
    const code = String(crypto.randomInt(100000, 1000000));
    const code_hash = crypto.createHash('sha256').update(code).digest('hex');
    await prisma.password_resets.deleteMany({ where: { user_id: user.user_id } });
    await prisma.password_resets.create({
      data: { user_id: user.user_id, code_hash, pending_email: email, expires_at: new Date(Date.now() + 10 * 60 * 1000) },
    });
    try {
      await sendCode(email, code, 'Verify your new BuildStock email', 'email verification code');
    } catch (err) {
      await prisma.password_resets.deleteMany({ where: { user_id: user.user_id } });
      throw err;
    }
    res.json({ message: 'Verification code sent.' });
  } catch (err) { handleError(res, err); }
};

exports.confirmEmailChange = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '');
    if (!email || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Enter the email and its 6-digit verification code' });
    }
    const code_hash = crypto.createHash('sha256').update(code).digest('hex');
    const reset = await prisma.password_resets.findFirst({
      where: { user_id: req.user.user_id, code_hash, pending_email: email, expires_at: { gt: new Date() } },
    });
    if (!reset) return res.status(400).json({ error: 'Invalid or expired verification code' });
    if (await prisma.users.findUnique({ where: { email }, select: { user_id: true } })) {
      return res.status(409).json({ error: 'That email is already registered' });
    }
    await prisma.$transaction([
      prisma.users.update({
        where: { user_id: req.user.user_id },
        data: { email },
        select: { user_id: true },
      }),
      prisma.password_resets.deleteMany({ where: { user_id: req.user.user_id } }),
    ]);
    res.json({ message: 'Email changed and verified.', email });
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
