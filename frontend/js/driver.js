const user = requireRole('driver');
if (user) loadShipments();

async function loadShipments() {
  setMessage('page-message', '', true);
  try {
    const [ships, orders] = await Promise.all([api('/shipments'), api('/orders')]);
    const address = {};
    orders.forEach((o) => { address[o.order_id] = o.delivery_address; });

    const cols = [
      { key: 'status', label: 'Status' },
      { key: 'order_id', label: 'Deliver to', format: (v) => address[v] || shortId(v) },
      { key: 'dispatched_at', label: 'Left', format: fmtDate },
      { key: 'delivered_at', label: 'Arrived', format: fmtDate },
    ];
    fillTable(document.getElementById('ship-table'), cols, ships, actionsFor);
  } catch (err) {
    setMessage('page-message', err.message, false);
  }
}

// The API only allows: assigned -> in transit -> delivered or failed
function actionsFor(row) {
  if (row.status === 'assigned') {
    return [btn('Start delivery', () => setStatus(row.shipment_id, 'in_transit'))];
  }
  if (row.status === 'in_transit') {
    return [
      btn('Mark delivered', () => setStatus(row.shipment_id, 'delivered')),
      btn('Mark failed', () => setStatus(row.shipment_id, 'failed'), 'secondary'),
    ];
  }
  return [];
}

async function setStatus(id, status) {
  try {
    await api('/shipments/' + id + '/status', { method: 'PATCH', body: { status } });
    await loadShipments();
  } catch (err) {
    setMessage('page-message', err.message, false);
  }
}
