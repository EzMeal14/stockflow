const user = requireRole('client');
if (user) startClient();

let itemMap = {};
let availability = {}; // item_id -> units available in the chosen warehouse
let catalogItems = [];
let catalogCards = new Map();
let availableGrid;
let unavailableGrid;

async function startClient() {
  document.getElementById('order-form').addEventListener('submit', placeOrder);
  document.getElementById('warehouse').addEventListener('change', refreshAvailability);
  document.getElementById('catalog-search').addEventListener('input', filterCatalog);
  try {
    await Promise.all([loadWarehouses(), loadCatalog(), loadOrders()]);
    await loadAvailability();
    await handlePaymentReturn();
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
  availableGrid = document.getElementById('catalog-available');
  unavailableGrid = document.getElementById('catalog-unavailable');
  if (!catalogItems.length) {
    document.getElementById('available-items-section').hidden = true;
    document.getElementById('unavailable-items-section').hidden = true;
    document.getElementById('catalog-empty').hidden = false;
    document.getElementById('catalog-search-status').textContent = '0 items';
    return;
  }
  document.getElementById('catalog-empty').hidden = true;
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
    availableGrid.append(card);
  });
  renderCatalogGroups();
}

function filterCatalog() {
  const query = document.getElementById('catalog-search').value.trim().toLowerCase();
  const status = document.getElementById('catalog-search-status');
  let matches = 0;
  let availableMatches = 0;
  let unavailableMatches = 0;
  catalogItems.forEach((item) => {
    const card = catalogCards.get(item.item_id);
    const match = !query
      || item.name.toLowerCase().includes(query)
      || item.id.toLowerCase().includes(query);
    card.hidden = !match;
    if (match) {
      matches++;
      const units = availability[item.item_id] || 0;
      if (item.is_active && units > 0) availableMatches++;
      else unavailableMatches++;
    }
  });
  document.getElementById('available-items-section').hidden = availableMatches === 0;
  document.getElementById('unavailable-items-section').hidden = unavailableMatches === 0;
  document.getElementById('available-items-count').textContent = String(availableMatches);
  document.getElementById('unavailable-items-count').textContent = String(unavailableMatches);
  status.textContent = query
    ? matches + (matches === 1 ? ' item found' : ' items found') + (matches ? '' : ' - no items match your search.')
    : catalogItems.length + (catalogItems.length === 1 ? ' item' : ' items');
}

function renderCatalogGroups() {
  availableGrid.replaceChildren();
  unavailableGrid.replaceChildren();
  catalogItems.forEach((item) => {
    const card = catalogCards.get(item.item_id);
    const units = availability[item.item_id] || 0;
    const isAvailable = item.is_active && units > 0;
    card.classList.toggle('item-card-inactive', !isAvailable);
    const state = card.querySelector('.item-card-state');
    state.textContent = !item.is_active ? 'Deactivated' : isAvailable ? 'Available' : 'Out of stock';
    state.classList.toggle('is-inactive', !isAvailable);
    (isAvailable ? availableGrid : unavailableGrid).append(card);
  });
  filterCatalog();
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
    card.querySelector('.available').textContent = units > 0 ? String(units) : 'Out of stock';
    input.max = String(units);
    input.disabled = units === 0 || !item || !item.is_active;
    if (input.disabled || Number(input.value) > units) input.value = '0';
  });
  renderCatalogGroups();
}

async function loadOrders() {
  const rows = await api('/orders');
  const cols = [
    { key: 'created_at', label: 'Date', format: fmtDate },
    { key: 'status', label: 'Status' },
    { key: 'payment_status', label: 'Payment' },
    { key: 'delivery_address', label: 'Deliver to' },
    { key: 'order_id', label: 'Order', format: shortId },
  ];
  fillTable(document.getElementById('orders-table'), cols, rows, (row) => {
    const actions = [
      btn('Details', () => showOrderDetail(row.order_id, document.getElementById('order-detail'), itemMap), 'secondary'),
    ];
    if (row.status === 'confirmed' && row.payment_status !== 'paid') {
      actions.push(btn('Pay / check status', () => startPayMongoCheckout(row.order_id)));
    }
    return actions;
  });
}

async function startPayMongoCheckout(orderId) {
  try {
    const result = await api('/orders/' + encodeURIComponent(orderId) + '/pay', {
      method: 'POST',
      body: {},
    });
    if (result.payment_status === 'paid') {
      setMessage('order-message', 'Payment verified. Thank you!', true);
      await loadOrders();
      return;
    }
    const checkout = new URL(result.checkout_url);
    if (checkout.protocol !== 'https:' || checkout.hostname !== 'checkout.paymongo.com') {
      throw new Error('PayMongo returned an unexpected checkout address.');
    }
    window.location.assign(checkout.toString());
  } catch (err) {
    setMessage('order-message', err.message, false);
  }
}

async function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('payment');
  const orderId = params.get('order_id');
  if (!['success', 'cancelled'].includes(result) || !orderId) return;
  window.history.replaceState({}, '', window.location.pathname);
  if (result === 'cancelled') {
    setMessage('order-message', 'Payment was not completed. You can try again from My orders.', false);
    return;
  }
  try {
    const payment = await api('/orders/' + encodeURIComponent(orderId) + '/payment/verify', {
      method: 'POST',
      body: {},
    });
    setMessage(
      'order-message',
      payment.payment_status === 'paid'
        ? 'Payment verified. Thank you!'
        : 'Payment is not confirmed yet. Use Pay / check status in My orders in a moment.',
      payment.payment_status === 'paid'
    );
    await loadOrders();
  } catch (err) {
    setMessage('order-message', err.message, false);
  }
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
    setMessage('order-message', 'Order placed. PayMongo payment will be available after the warehouse confirms your order.', true);
  } catch (err) {
    // For example "Not enough stock" comes from the database rule
    setMessage('order-message', err.message, false);
  }
}
