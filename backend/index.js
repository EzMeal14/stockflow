require('dotenv').config();

if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
  throw new Error('JWT_SECRET must be set to at least 32 bytes in .env; generate one with crypto.randomBytes(32).toString("hex")');
}

const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));