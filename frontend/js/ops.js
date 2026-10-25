// Stock, orders and shipments. Shared by the staff and admin dashboards.
// ctx.warehouseId is set for staff (one fixed warehouse).
// For admin it is null, and the warehouse is chosen in the #stock-warehouse list.

async function initOps(ctx) {
  const $ = (id) => document.getElementById(id);
  const wsel = $('stock-warehouse');
  const state = {
    items: [], itemMap: {}, drivers: [], driverMap: {},
    vehicles: [], vehicleMap: {}, warehouses: [], orders: [], ships: [],
  };

  const current = () => ctx.warehouseId || (wsel ? wsel.value : '');
  const itemName = (id) => (state.itemMap[id] ? state.itemMap[id].name : shortId(id));
  const itemSku = (id) => (state.itemMap[id] ? state.itemMap[id].sku : '');
  const warehouseLabel = (w) => w.name + ' (' + w.city + ')';

  // Run something and show any error in a message line
  async function run(fn, msgId) {
    try {
      await fn();
    } catch (err) {
      setMessage(msgId || 'page-message', err.message, false);
    }
  }

  function wholeNumber(id) {
    const n = Number($(id).value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  // ---------- lists used by the forms ----------

  async function loadLookups() {
    const [items, drivers, vehicles, warehouses] = await Promise.all([
      api('/items'), api('/lookups/drivers'), api('/vehicles'), api('/lookups/warehouses'),
    ]);
    state.items = items;
    state.itemMap = indexBy(items, 'item_id');
    state.drivers = drivers;
    state.driverMap = indexBy(drivers, 'user_id');
    state.vehicles = vehicles;
    state.vehicleMap = indexBy(vehicles, 'vehicle_id');
    state.warehouses = warehouses;

    const itemLabel = (i) => i.sku + ' - ' + i.name;
    fillSelect($('restock-item'), items, (i) => i.item_id, itemLabel);
    fillSelect($('transfer-item'), items, (i) => i.item_id, itemLabel);
    fillSelect($('ship-driver'), drivers, (d) => d.user_id, (d) => d.firstname + ' ' + d.lastname);
    fillSelect($('ship-vehicle'), vehicles, (v) => v.vehicle_id, (v) => v.plate + ' (' + v.type + ')');
    if (wsel) fillSelect(wsel, warehouses, (w) => w.warehouse_id, warehouseLabel);
    fillDestinations();
  }

  function fillDestinations() {
    const others = state.warehouses.filter((w) => w.warehouse_id !== current());
    fillSelect($('transfer-dest'), others, (w) => w.warehouse_id, warehouseLabel);
  }

  // Only confirmed orders that have no shipment yet can be shipped
  function fillShipOrders() {
    const shipped = new Set(state.ships.map((s) => s.order_id));
    const ready = state.orders.filter((o) => o.status === 'confirmed' && !shipped.has(o.order_id));
    fillSelect($('ship-order'), ready, (o) => o.order_id,
      (o) => shortId(o.order_id) + ' - ' + o.delivery_address);
  }

  // ---------- tables ----------

  async function loadStock() {
    const wid = current();
    const cols = [
      { key: 'sku', label: 'SKU' },
      { key: 'name', label: 'Item' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'reorder_threshold', label: 'Reorder level' },
    ];
    if (!wid) {
      fillTable($('stock-table'), cols, []);
      return;
    }
    const rows = await api('/warehouses/' + wid + '/inventory');
    const view = rows.map((r) => ({
      sku: itemSku(r.item_id),
      name: itemName(r.item_id),
      quantity: r.quantity,
      reorder_threshold: r.reorder_threshold,
    }));
    fillTable($('stock-table'), cols, view, null,
      (r) => (r.quantity < r.reorder_threshold ? 'low' : ''));
  }

  async function loadLow() {
    const rows = await api('/stock/low');
    fillTable($('low-table'), [
      { key: 'warehouse', label: 'Warehouse' },
      { key: 'sku', label: 'SKU' },
      { key: 'item', label: 'Item' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'reorder_threshold', label: 'Reorder level' },
    ], rows);
  }

  async function loadMoves() {
    const wid = current();
    // Staff always get their own warehouse. Admin can filter by the chosen warehouse.
    const query = !ctx.warehouseId && wid ? '?warehouse_id=' + wid : '';
    const rows = await api('/stock/movements' + query);
    fillTable($('moves-table'), [
      { key: 'created_at', label: 'When', format: fmtDate },
      { key: 'movement_type', label: 'Type' },
      { key: 'quantity_change', label: 'Change', format: (v) => (v > 0 ? '+' + v : String(v)) },
      { key: 'item_id', label: 'Item', format: itemName },
      { key: 'performed_by', label: 'By', format: shortId },
    ], rows);
  }

  async function loadOrders() {
    state.orders = await api('/orders');
    const cols = [
      { key: 'created_at', label: 'Date', format: fmtDate },
      { key: 'status', label: 'Status' },
      { key: 'delivery_address', label: 'Deliver to' },
      { key: 'order_id', label: 'Order', format: shortId },
    ];
    fillTable($('orders-table'), cols, state.orders, (row) => {
      const buttons = [btn('Details', () => showOrderDetail(row.order_id, $('order-detail'), state.itemMap), 'secondary')];
      if (row.status === 'pending') buttons.push(btn('Confirm', () => confirmOrder(row.order_id)));
      return buttons;
    });
  }

  async function loadShips() {
    state.ships = await api('/shipments');
    const cols = [
      { key: 'status', label: 'Status' },
      { key: 'order_id', label: 'Order', format: shortId },
      { key: 'driver_id', label: 'Driver',
        format: (v) => (state.driverMap[v] ? state.driverMap[v].firstname + ' ' + state.driverMap[v].lastname : shortId(v)) },
      { key: 'vehicle_id', label: 'Vehicle', format: (v) => (state.vehicleMap[v] ? state.vehicleMap[v].plate : shortId(v)) },
      { key: 'dispatched_at', label: 'Left', format: fmtDate },
      { key: 'delivered_at', label: 'Arrived', format: fmtDate },
    ];
    fillTable($('ship-table'), cols, state.ships);
  }

  const refreshStock = () => Promise.all([loadStock(), loadLow(), loadMoves()]);

  async function refreshOrdersAndShips() {
    await Promise.all([loadOrders(), loadShips()]);
    fillShipOrders();
  }

  // ---------- actions ----------

  function confirmOrder(orderId) {
    return run(async () => {
      setMessage('orders-msg', '', true);
      await api('/orders/' + orderId + '/confirm', { method: 'POST' });
      await Promise.all([refreshOrdersAndShips(), refreshStock()]);
      setMessage('orders-msg', 'Order confirmed. The database took the stock out.', true);
    }, 'orders-msg');
  }

  $('restock-form').addEventListener('submit', (e) => {
    e.preventDefault();
    run(async () => {
      setMessage('restock-msg', '', true);
      const quantity = wholeNumber('restock-qty');
      if (!current()) throw new Error('Choose a warehouse first');
      if (!quantity) throw new Error('Quantity must be a whole number above 0');
      await api('/stock/restock', {
        method: 'POST',
        body: { warehouse_id: current(), item_id: $('restock-item').value, quantity },
      });
      $('restock-qty').value = '';
      await refreshStock();
      setMessage('restock-msg', 'Stock added.', true);
    }, 'restock-msg');
  });

  $('transfer-form').addEventListener('submit', (e) => {
    e.preventDefault();
    run(async () => {
      setMessage('transfer-msg', '', true);
      const quantity = wholeNumber('transfer-qty');
      if (!current()) throw new Error('Choose a warehouse first');
      if (!$('transfer-dest').value) throw new Error('Choose a destination warehouse');
      if (!quantity) throw new Error('Quantity must be a whole number above 0');
      await api('/stock/transfer', {
        method: 'POST',
        body: {
          from_warehouse_id: current(),
          to_warehouse_id: $('transfer-dest').value,
          item_id: $('transfer-item').value,
          quantity,
        },
      });
      $('transfer-qty').value = '';
      await refreshStock();
      setMessage('transfer-msg', 'Stock moved.', true);
    }, 'transfer-msg');
  });

  $('ship-form').addEventListener('submit', (e) => {
    e.preventDefault();
    run(async () => {
      setMessage('ship-msg', '', true);
      const order_id = $('ship-order').value;
      const driver_id = $('ship-driver').value;
      const vehicle_id = $('ship-vehicle').value;
      if (!order_id || !driver_id || !vehicle_id) {
        throw new Error('Choose a confirmed order, a driver and a vehicle');
      }
      await api('/shipments', { method: 'POST', body: { order_id, driver_id, vehicle_id } });
      await refreshOrdersAndShips();
      setMessage('ship-msg', 'Shipment created.', true);
    }, 'ship-msg');
  });

  if (wsel) {
    wsel.addEventListener('change', () => {
      fillDestinations();
      run(async () => {
        await Promise.all([loadStock(), loadMoves()]);
      });
    });
  }

  // ---------- first load ----------

  async function reload() {
    await run(async () => {
      await loadLookups();
      await Promise.all([loadStock(), loadLow(), loadMoves(), loadOrders(), loadShips()]);
      fillShipOrders();
    });
  }

  await reload();
  return { reload };
}
