const prisma = require('../lib/prisma');
const { handleError } = require('../lib/errors');
const {
  request: paymongoRequest,
  paymentMethods,
  checkoutReturnUrl,
  verifyWebhookSignature,
} = require('../lib/paymongo');

function unitPriceInCentavos(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error('Order contains an invalid item price.');
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('Order price exceeds supported payment amount.');
  return cents;
}

async function ownedOrder(orderId, clientId) {
  return prisma.orders.findFirst({ where: { order_id: orderId, client_id: clientId } });
}

async function persistPaid(order, checkoutSession) {
  const attrs = checkoutSession && checkoutSession.attributes;
  if (!attrs || checkoutSession.id !== order.payment_checkout_id
    || attrs.livemode !== false
    || attrs.reference_number !== order.order_id
    || !Array.isArray(attrs.payments)
    || !attrs.payments.some((payment) => payment.attributes && payment.attributes.status === 'paid')) {
    return false;
  }
  const updated = await prisma.orders.updateMany({
    where: {
      order_id: order.order_id,
      payment_checkout_id: checkoutSession.id,
      payment_status: 'unpaid',
      status: 'confirmed',
    },
    data: { payment_status: 'paid' },
  });
  if (updated.count) return true;
  const latest = await prisma.orders.findUnique({
    where: { order_id: order.order_id },
    select: { payment_status: true },
  });
  return latest && latest.payment_status === 'paid';
}

exports.createCheckout = async (req, res) => {
  try {
    const order = await ownedOrder(req.params.id, req.user.user_id);
    if (!order) return res.status(404).json({ error: 'Not found' });
    if (order.status !== 'confirmed') {
      return res.status(409).json({ error: 'Your order must be confirmed by the warehouse before payment.' });
    }
    if (order.payment_status === 'paid') return res.json({ payment_status: 'paid' });

    if (order.payment_checkout_id) {
      const current = await paymongoRequest(`/checkout_sessions/${encodeURIComponent(order.payment_checkout_id)}`);
      if (await persistPaid(order, current)) return res.json({ payment_status: 'paid' });
      if (current.attributes && current.attributes.status === 'active' && current.attributes.checkout_url) {
        return res.json({ checkout_url: current.attributes.checkout_url });
      }
    }

    const lines = await prisma.order_items.findMany({
      where: { order_id: order.order_id },
      include: { items: { select: { name: true } } },
      orderBy: { order_item_id: 'asc' },
    });
    if (!lines.length) return res.status(409).json({ error: 'This order has no payable items.' });

    const lineItems = lines.map((line) => {
      const amount = unitPriceInCentavos(line.unit_price);
      if (!Number.isSafeInteger(amount * line.quantity)) {
        throw new Error('Order total exceeds supported payment amount.');
      }
      return {
        name: String(line.items.name).slice(0, 100),
        amount,
        currency: 'PHP',
        quantity: line.quantity,
      };
    });
    const totalCentavos = lineItems.reduce((sum, line) => sum + line.amount * line.quantity, 0);
    if (!Number.isSafeInteger(totalCentavos) || totalCentavos <= 0) {
      return res.status(409).json({ error: 'PayMongo checkout requires an order total greater than zero.' });
    }
    const returnUrl = checkoutReturnUrl(order.order_id, 'success');
    const cancelUrl = checkoutReturnUrl(order.order_id, 'cancelled');
    const session = await paymongoRequest('/checkout_sessions', {
      method: 'POST',
      body: {
        data: {
          attributes: {
            line_items: lineItems,
            payment_method_types: paymentMethods(),
            success_url: returnUrl,
            cancel_url: cancelUrl,
            reference_number: order.order_id,
            send_email_receipt: true,
            metadata: { order_id: order.order_id },
          },
        },
      },
    });
    const attributes = session && session.attributes;
    if (!session || !session.id || !attributes || !attributes.checkout_url) {
      throw new Error('PayMongo did not return a checkout session URL.');
    }
    await prisma.orders.update({
      where: { order_id: order.order_id },
      data: { payment_checkout_id: session.id },
    });
    res.json({ checkout_url: attributes.checkout_url });
  } catch (err) {
    handleError(res, err);
  }
};

exports.verifyCheckout = async (req, res) => {
  try {
    const order = await ownedOrder(req.params.id, req.user.user_id);
    if (!order) return res.status(404).json({ error: 'Not found' });
    if (order.payment_status === 'paid') return res.json({ payment_status: 'paid' });
    if (!order.payment_checkout_id || order.status !== 'confirmed') {
      return res.json({ payment_status: order.payment_status });
    }
    const session = await paymongoRequest(`/checkout_sessions/${encodeURIComponent(order.payment_checkout_id)}`);
    const paid = await persistPaid(order, session);
    res.json({ payment_status: paid ? 'paid' : order.payment_status });
  } catch (err) {
    handleError(res, err);
  }
};

exports.webhook = async (req, res) => {
  const signature = req.get('X-Paymongo-Signature');
  if (!verifyWebhookSignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid PayMongo webhook signature' });
  }
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }
  const data = event && event.data;
  if (!data || data.type !== 'checkout_session.payment.paid' || data.livemode !== false) {
    return res.sendStatus(200);
  }
  const session = data.data;
  const attrs = session && session.attributes;
  const orderId = attrs && attrs.reference_number;
  if (!session || !session.id || !orderId || !Array.isArray(attrs.payments)
    || !attrs.payments.some((payment) => payment.attributes && payment.attributes.status === 'paid')) {
    return res.sendStatus(200);
  }

  try {
    await prisma.orders.updateMany({
      where: {
        order_id: orderId,
        payment_checkout_id: session.id,
        payment_status: 'unpaid',
        status: 'confirmed',
      },
      data: { payment_status: 'paid' },
    });
    return res.sendStatus(200);
  } catch (err) {
    console.error('Could not apply PayMongo payment webhook:', err);
    return res.status(500).json({ error: 'Could not process payment event' });
  }
};
