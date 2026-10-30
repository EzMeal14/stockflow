const jwt = require('jsonwebtoken');
const prisma = require('./prisma');

function signToken(user) {
  return jwt.sign({ sub: user.user_id, ver: user.session_version }, process.env.JWT_SECRET, { expiresIn: '8h' });
}

// Checks the token, then loads the user from the database on every request,
// so a disabled account or a changed role takes effect right away.
async function authenticate(req, res, next) {
  try {
    const [type, token] = (req.headers.authorization || '').split(' ');
    if (type !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Login required' });
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.users.findUnique({
      where: { user_id: payload.sub },
      select: {
        user_id: true,
        role: true,
        warehouse_id: true,
        is_active: true,
        is_available: true,
        session_version: true,
      },
    });
    if (!user || !user.is_active || payload.ver !== user.session_version) {
      return res.status(401).json({ error: 'Account not found or disabled' });
    }
    req.user = {
      user_id: user.user_id,
      role: user.role,
      warehouse_id: user.warehouse_id,
      is_available: user.is_available,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You are not allowed to do this' });
    }
    next();
  };
}

module.exports = { signToken, authenticate, requireRole };