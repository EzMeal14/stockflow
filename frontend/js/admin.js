const user = requireRole('admin');

let ops = null;
// After items, warehouses or vehicles change, refresh the lists used by the other tabs
const refreshOps = () => { if (ops) ops.reload(); };

if (user) {
  setupTabs();

  setupCrud({
    root: 'items-root', path: '/items', idKey: 'item_id',
    fields: [
      { key: 'sku', label: 'SKU', required: true },
      { key: 'name', label: 'Name', required: true },
      { key: 'description', label: 'Description' },
      { key: 'unit_price', label: 'Price', type: 'number', step: '0.01', required: true },
    ],
    columns: [
      { key: 'sku', label: 'SKU' },
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'unit_price', label: 'Price', format: money },
    ],
  });

  setupCrud({
    root: 'warehouses-root', path: '/warehouses', idKey: 'warehouse_id',
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'address', label: 'Address', required: true },
      { key: 'city', label: 'City', required: true },
    ],
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'address', label: 'Address' },
      { key: 'city', label: 'City' },
    ],
  });

  setupCrud({
    root: 'vehicles-root', path: '/vehicles', idKey: 'vehicle_id',
    fields: [
      { key: 'plate', label: 'Plate', required: true },
      { key: 'type', label: 'Type', required: true },
    ],
    columns: [
      { key: 'plate', label: 'Plate' },
      { key: 'type', label: 'Type' },
    ],
  });

  // Orders, shipments and stock use the same code as the staff page
  initOps({ warehouseId: null }).then((o) => { ops = o; });
}

function setupTabs() {
  const show = (name) => {
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  };
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
}

// One form and one table to add, edit and deactivate records.
// The API never deletes rows. "Deactivate" only turns is_active off.
function setupCrud(cfg) {
  const root = document.getElementById(cfg.root);
  const inputs = {};
  let editingId = null;

  const msg = el('p');
  const say = (text, ok) => { msg.textContent = text || ''; msg.className = text ? (ok ? 'ok' : 'error') : ''; };

  const submit = el('button', { type: 'submit', text: 'Add' });
  const cancel = el('button', { type: 'button', class: 'secondary', hidden: true, text: 'Cancel', onclick: reset });
  const form = el('form', { class: 'row' });
  cfg.fields.forEach((f) => {
    const attrs = { type: f.type || 'text' };
    if (f.type === 'number') { attrs.min = '0'; attrs.step = f.step || '1'; }
    const input = el('input', attrs);
    if (f.required) input.required = true;
    inputs[f.key] = input;
    form.append(el('label', null, f.label, input));
  });
  form.append(submit, cancel);

  const table = el('table');
  root.replaceChildren(form, msg, table);

  function reset() {
    editingId = null;
    form.reset();
    submit.textContent = 'Add';
    cancel.hidden = true;
  }

  function startEdit(row) {
    editingId = row[cfg.idKey];
    cfg.fields.forEach((f) => {
      inputs[f.key].value = row[f.key] === null || row[f.key] === undefined ? '' : row[f.key];
    });
    submit.textContent = 'Save changes';
    cancel.hidden = false;
    say('', true);
  }

  async function load() {
    const rows = await api(cfg.path);
    fillTable(table, cfg.columns, rows, (row) => [
      btn('Edit', () => startEdit(row)),
      btn('Deactivate', () => deactivate(row), 'secondary'),
    ]);
  }

  async function deactivate(row) {
    if (!confirm('Deactivate this record? It will be hidden, not deleted.')) return;
    try {
      await api(cfg.path + '/' + row[cfg.idKey], { method: 'DELETE' });
      await load();
      refreshOps();
      say('Record deactivated.', true);
    } catch (err) {
      say(err.message, false);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    say('', true);
    const body = {};
    cfg.fields.forEach((f) => {
      const v = inputs[f.key].value.trim();
      if (f.type === 'number') body[f.key] = v === '' ? null : Number(v);
      else body[f.key] = v === '' && !f.required ? null : v;
    });
    try {
      if (editingId) await api(cfg.path + '/' + editingId, { method: 'PUT', body });
      else await api(cfg.path, { method: 'POST', body });
      reset();
      await load();
      refreshOps();
      say('Saved.', true);
    } catch (err) {
      say(err.message, false);
    }
  });

  load().catch((err) => say(err.message, false));
}
