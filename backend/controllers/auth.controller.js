const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');
const { signToken } = require('../lib/auth');

async function sendEmail(email, subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Email verification is not configured');
  const from = process.env.RESEND_FROM || 'StockFlow <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject, text }),
  });
  if (!response.ok) {
    const provider = await response.json().catch(() => null);
    const reason = provider && typeof provider.message === 'string'
      ? `: ${provider.message}`
      : '';
    throw new Error(`Could not send verification email${reason}`);
  }
}

function registrationPayload(body) {
  const firstname = String(body.firstname || '').trim();
  const lastname = String(body.lastname || '').trim();
  const rawEmail = String(body.email || '');
  const email = rawEmail.trim().toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!firstname || !lastname || !email || !password || email.length > 254
    || /\s/.test(rawEmail) || password.length < 8 || /\s/.test(password)) {
    return { error: 'Email and password cannot contain spaces, and the password must have 8 or more characters' };
  }
  return { firstname, lastname, email, password };
}

// Verify ownership before creating a client account. Staff, drivers and admins are made by an admin.
exports.requestRegistrationCode = async (req, res) => {
  try {
    const payload = registrationPayload(req.body);
    if (payload.error) return res.status(400).json({ error: payload.error });
    const existing = await prisma.users.findUnique({ where: { email: payload.email } });
    if (existing) return res.status(409).json({ error: 'That email is already registered' });

    const code = String(crypto.randomInt(100000, 1000000));
    const code_hash = crypto.createHash('sha256').update(code).digest('hex');
    await prisma.email_verifications.upsert({
      where: { email: payload.email },
      update: { code_hash, expires_at: new Date(Date.now() + 10 * 60 * 1000), attempts: 0, created_at: new Date() },
      create: { email: payload.email, code_hash, expires_at: new Date(Date.now() + 10 * 60 * 1000) },
    });
    try {
      await sendEmail(payload.email, 'Verify your StockFlow email',
        `Your StockFlow verification code is ${code}. It expires in 10 minutes.`);
    } catch (err) {
      await prisma.email_verifications.delete({ where: { email: payload.email } });
      throw err;
    }
    res.json({ message: 'Verification code sent. Check your email.' });
  } catch (err) {
    handleError(res, err);
  }
};

exports.verifyRegistration = async (req, res) => {
  try {
    const payload = registrationPayload(req.body);
    const code = String(req.body.code || '');
    if (payload.error) return res.status(400).json({ error: payload.error });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit verification code' });

    const code_hash = crypto.createHash('sha256').update(code).digest('hex');
    const verification = await prisma.email_verifications.findUnique({
      where: { email: payload.email },
    });
    if (!verification || verification.expires_at <= new Date()) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }
    if (verification.attempts >= 5) {
      await prisma.email_verifications.delete({ where: { email: payload.email } });
      return res.status(429).json({ error: 'Too many attempts. Request a new verification code.' });
    }
    if (verification.code_hash !== code_hash) {
      await prisma.email_verifications.update({ where: { email: payload.email }, data: { attempts: { increment: 1 } } });
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    const password_hash = await bcrypt.hash(payload.password, 10);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.users.create({
        data: { firstname: payload.firstname, lastname: payload.lastname, email: payload.email,
          password_hash, role: 'client' },
      });
      await tx.email_verifications.delete({ where: { email: payload.email } });
      return created;
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
  if (!response.ok) {
    const provider = await response.json().catch(() => null);
    const reason = provider && typeof provider.message === 'string'
      ? `: ${provider.message}`
      : '';
    throw new Error(`Could not send password reset email${reason}`);
  }
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