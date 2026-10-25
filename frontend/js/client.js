const user = requireRole('client');
if (user) startClient();

let itemMap = {};

async function startClient() {
  document.getElementById('order-form').addEventListener('submit', placeOrder);
  try {
    await Promise.all([loadWarehouses(), loadCatalog(), loadOrders()]);
  } catch (err) {
    setMessage('order-message', err.message, false);
  }
}

async function loadWarehouses() {
  const rows = await api('/warehouses');
  fillSelect(document.getElementById('warehouse'), rows,
    (w) => w.warehouse_id, (w) => w.name + ' (' + w.city + ')');
}

async function loadCatalog() {
  const items = await api('/items');
  itemMap = indexBy(items, 'item_id');
  const body = document.getElementById('catalog');
  body.replaceChildren();
  items.forEach((item) => {
    const input = el('input', { type: 'number', min: '0', step: '1', value: '0' });
    input.dataset.itemId = item.item_id;
    body.append(el('tr', null,
      el('td', { text: item.sku }),
      el('td', { text: item.name }),
      el('td', { text: money(item.unit_price) }),
      el('td', null, input)));
  });
}

async function loadOrders() {
  const rows = await api('/orders');
  const cols = [
    { key: 'created_at', label: 'Date', format: fmtDate },
    { key: 'status', label: 'Status' },
    { key: 'delivery_address', label: 'Deliver to' },
    { key: 'order_id', label: 'Order', format: shortId },
  ];
  fillTable(document.getElementById('orders-table'), cols, rows, (row) => [
    btn('Details', () => showOrderDetail(row.order_id, document.getElementById('order-detail'), itemMap), 'secondary'),
  ]);
}

async function placeOrder(e) {
  e.preventDefault();
  setMessage('order-message', '', true);

  const inputs = document.querySelectorAll('#catalog input');
  const items = [];
  inputs.forEach((input) => {
    const quantity = Number(input.value);
    if (Number.isInteger(quantity) && quantity > 0) {
      items.push({ item_id: input.dataset.itemId, quantity });
    }
  });
  if (items.length === 0) {
    setMessage('order-message', 'Choose a quantity of at least 1 for one item', false);
    return;
  }

  try {
    const result = await api('/orders', {
      method: 'POST',
      body: {
        warehouse_id: document.getElementById('warehouse').value,
        delivery_address: document.getElementById('address').value,
        items,
      },
    });
    inputs.forEach((input) => { input.value = '0'; });
    await loadOrders();
    setMessage('order-message', 'Order placed. Status: ' + result.status, true);
  } catch (err) {
    // For example "Not enough stock" comes from the database rule
    setMessage('order-message', err.message, false);
  }
}
