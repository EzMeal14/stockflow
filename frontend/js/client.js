const user = requireRole('client');
if (user) startClient();

let itemMap = {};
let availability = {}; // item_id -> units available in the chosen warehouse

async function startClient() {
  document.getElementById('order-form').addEventListener('submit', placeOrder);
  document.getElementById('warehouse').addEventListener('change', refreshAvailability);
  try {
    await Promise.all([loadWarehouses(), loadCatalog(), loadOrders()]);
    await loadAvailability();
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
    const available = el('td', { class: 'available', text: '...' });
    body.append(el('tr', null,
      el('td', { text: item.sku }),
      el('td', { text: item.name }),
      el('td', { text: money(item.unit_price) }),
      available,
      el('td', null, input)));
  });
}

// How many units of each item are in the chosen warehouse
async function loadAvailability() {
  const warehouseId = document.getElementById('warehouse').value;
  availability = {};
  if (warehouseId) {
    const rows = await api('/lookups/availability?warehouse_id=' + encodeURIComponent(warehouseId));
    rows.forEach((r) => { availability[r.item_id] = r.available; });
  }
  showAvailability();
}

async function refreshAvailability() {
  try {
    await loadAvailability();
  } catch (err) {
    setMessage('order-message', err.message, false);
  }
}

// Show the number next to each item. An item that is out of stock cannot be ordered.
function showAvailability() {
  document.querySelectorAll('#catalog tr').forEach((row) => {
    const input = row.querySelector('input');
    const units = availability[input.dataset.itemId] || 0;
    row.querySelector('.available').textContent = units > 0 ? String(units) : 'Out of stock';
    input.max = String(units);
    input.disabled = units === 0;
    if (units === 0 || Number(input.value) > units) input.value = '0';
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
    inputs.forEach((input) => { if (!input.disabled) input.value = '0'; });
    await loadOrders();
    await loadAvailability();
    setMessage('order-message', 'Order placed. Status: ' + result.status, true);
  } catch (err) {
    // For example "Not enough stock" comes from the database rule
    setMessage('order-message', err.message, false);
  }
}
