const crypto = require('crypto');

const API_BASE = 'https://api.paymongo.com/v2';

function getSecretKey() {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key || !key.startsWith('sk_test_')) {
    throw new Error('PayMongo test mode requires a PAYMONGO_SECRET_KEY beginning with sk_test_.');
  }
  return key;
}

function paymentMethods() {
  const methods = String(process.env.PAYMONGO_PAYMENT_METHOD_TYPES || '')
    .split(',')
    .map((method) => method.trim())
    .filter(Boolean);
  if (!methods.length) throw new Error('PAYMONGO_PAYMENT_METHOD_TYPES is not configured.');
  return [...new Set(methods)];
}

async function request(path, options = {}) {
  const key = getSecretKey();
  const response = await fetch(API_BASE + path, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`PayMongo request failed with status ${response.status}`);
    error.providerStatus = response.status;
    error.providerBody = body;
    throw error;
  }
  return body.data;
}

function checkoutReturnUrl(orderId, result) {
  const base = process.env.PAYMONGO_RETURN_URL;
  if (!base) throw new Error('PAYMONGO_RETURN_URL is not configured.');
  const url = new URL(base);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('PAYMONGO_RETURN_URL must use HTTPS outside local development.');
  }
  url.searchParams.set('payment', result);
  url.searchParams.set('order_id', orderId);
  return url.toString();
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(rawBody) || !signature) return false;
  const parts = Object.fromEntries(signature.split(',').map((part) => {
    const separator = part.indexOf('=');
    return separator > 0 ? [part.slice(0, separator).trim(), part.slice(separator + 1).trim()] : ['', ''];
  }).filter(([key, value]) => key && value));
  if (!/^\d+$/.test(parts.t || '')) return false;

  const signedPayload = Buffer.concat([Buffer.from(`${parts.t}.`), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest();
  return ['te', 'li'].some((key) => {
    if (!/^[a-f0-9]{64}$/i.test(parts[key] || '')) return false;
    const received = Buffer.from(parts[key], 'hex');
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  });
}

module.exports = {
  request,
  paymentMethods,
  checkoutReturnUrl,
  verifyWebhookSignature,
};
