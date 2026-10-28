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
    });
    res.status(201).json({ user_id: user.user_id, email: user.email, role: user.role });
  } catch (err) {
    handleError(res, err);
  }
};

async function sendResetCode(email, code) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Password reset email is not configured');
  const from = process.env.RESEND_FROM || 'StockFlow <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Your StockFlow password reset code',
      text: `Your StockFlow password reset code is ${code}. It expires in 10 minutes.`,
    }),
  });
  if (!response.ok) throw new Error('Could not send password reset email');
}

exports.forgotPassword = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const genericMessage = 'If that email is registered, a verification code was sent.';
    const user = await prisma.users.findFirst({ where: { email, is_active: true } });
    if (!user) return res.json({ message: genericMessage });

    const code = String(crypto.randomInt(100000, 1000000));
    const code_hash = crypto.createHash('sha256').update(code).digest('hex');
    await prisma.password_resets.deleteMany({ where: { user_id: user.user_id } });
    await prisma.password_resets.create({
      data: { user_id: user.user_id, code_hash, expires_at: new Date(Date.now() + 10 * 60 * 1000) },
    });
    try {
      await sendResetCode(email, code);
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
      include: { users: true },
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