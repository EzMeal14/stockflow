const user = requireRole('client');
if (user) startClient();

let itemMap = {};
let availability = {}; // item_id -> units available in the chosen warehouse
let catalogItems = [];
let catalogCards = new Map();

async function startClient() {
  document.getElementById('order-form').addEventListener('submit', placeOrder);
  document.getElementById('warehouse').addEventListener('change', refreshAvailability);
  document.getElementById('catalog-search').addEventListener('input', filterCatalog);
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
  catalogItems = sortById(await api('/items/catalog'), 'id');
  itemMap = indexBy(catalogItems, 'item_id');
  catalogCards = new Map();
  const grid = document.getElementById('catalog');
  grid.replaceChildren();
  if (!catalogItems.length) {
    grid.append(el('div', { class: 'item-empty', text: 'No items are currently listed.' }));
    document.getElementById('catalog-search-status').textContent = '0 items';
    return;
  }
  catalogItems.forEach((item) => {
    const input = el('input', { type: 'number', min: '0', step: '1', value: '0' });
    input.dataset.itemId = item.item_id;
    const media = item.image_data
      ? el('img', { class: 'item-card-image', src: item.image_data, alt: item.name, loading: 'lazy' })
      : el('div', { class: 'item-card-placeholder' },
        el('span', { class: 'no-image-icon', 'aria-hidden': 'true' }),
        el('strong', { text: 'No image' }),
        el('span', { text: 'No image attached' })
      );
    const card = el('article', { class: 'item-card client-item-card' + (item.is_active ? '' : ' item-card-inactive') },
      el('div', { class: 'item-card-media' }, media),
      el('div', { class: 'item-card-content' },
        el('div', { class: 'item-card-topline' },
          el('span', { class: 'item-card-id', text: item.id }),
          el('span', {
            class: 'item-card-state' + (item.is_active ? '' : ' is-inactive'),
            text: item.is_active ? 'Active' : 'Deactivated',
          })
        ),
        el('h3', { text: item.name }),
        el('p', { class: 'item-card-description', text: item.description || 'No description provided.' }),
        el('div', { class: 'item-card-meta' },
          el('div', null,
            el('span', { text: 'Price' }),
            el('strong', { text: money(item.unit_price) })
          ),
          el('div', null,
            el('span', { text: 'Available' }),
            el('strong', { class: 'available', text: '...' })
          )
        ),
        el('label', { class: 'client-item-quantity' }, 'Quantity', input)
      )
    );
    card.dataset.itemId = item.item_id;
    catalogCards.set(item.item_id, card);
    grid.append(card);
  });
  filterCatalog();
}

function filterCatalog() {
  const query = document.getElementById('catalog-search').value.trim().toLowerCase();
  const status = document.getElementById('catalog-search-status');
  let matches = 0;
  catalogItems.forEach((item) => {
    const card = catalogCards.get(item.item_id);
    const match = !query
      || item.name.toLowerCase().includes(query)
      || item.id.toLowerCase().includes(query);
    card.hidden = !match;
    if (match) matches++;
  });
  status.textContent = query
    ? matches + (matches === 1 ? ' item found' : ' items found') + (matches ? '' : ' - no items match your search.')
    : catalogItems.length + (catalogItems.length === 1 ? ' item' : ' items');
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
  document.querySelectorAll('#catalog .client-item-card').forEach((card) => {
    const input = card.querySelector('input');
    const units = availability[input.dataset.itemId] || 0;
    const item = itemMap[input.dataset.itemId];
    const availabilityText = units > 0 ? String(units) : 'Out of stock';
    card.querySelector('.available').textContent = item && !item.is_active
      ? availabilityText + ' (deactivated)'
      : availabilityText;
    input.max = String(units);
    input.disabled = units === 0 || !item || !item.is_active;
    if (input.disabled || Number(input.value) > units) input.value = '0';
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

  const inputs = document.querySelectorAll('#catalog input[type="number"]');
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
