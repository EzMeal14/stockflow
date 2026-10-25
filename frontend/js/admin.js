const user = requireRole('admin');

let ops = null;
// After items, warehouses, vehicles or drivers change, refresh the lists used by the other tabs
const refreshOps = () => { if (ops) ops.reload(); };

if (user) {
  setupTabs();

  setupCrud({
    root: 'items-root', path: '/items', idKey: 'item_id',
    hint: 'SKU: leave it empty to get the next number automatically, or type a number (2 becomes SKU-002). '
      + 'When you edit an item, an empty SKU keeps the current one.',
    fields: [
      { key: 'sku', label: 'SKU', placeholder: 'Empty = next number' },
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
    describe: (saved) => 'Saved. SKU: ' + saved.sku,
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

  // Driver accounts: add a driver, or remove one (the account is switched off, not deleted)
  setupCrud({
    root: 'drivers-root', path: '/drivers', idKey: 'user_id',
    canEdit: false,
    removeLabel: 'Remove',
    confirmText: 'Remove this driver? The account is switched off. Past shipments stay in the history.',
    removedMessage: 'Driver removed.',
    hint: 'A new driver signs in with this email and password. A driver who still has open shipments cannot be removed.',
    fields: [
      { key: 'firstname', label: 'First name', required: true },
      { key: 'lastname', label: 'Last name', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'off' },
      { key: 'password', label: 'Password (8 or more characters)', type: 'password', required: true, minlength: 8, autocomplete: 'new-password' },
    ],
    columns: [
      { key: 'firstname', label: 'First name' },
      { key: 'lastname', label: 'Last name' },
      { key: 'email', label: 'Email' },
    ],
    describe: (saved) => 'Driver added: ' + saved.email,
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

// One form and one table to add, edit and remove records.
// The API never deletes rows. "Deactivate" and "Remove" only turn a record off.
// Options: hint, describe(saved), canEdit (default true), removeLabel, confirmText, removedMessage.
function setupCrud(cfg) {
  const root = document.getElementById(cfg.root);
  const canEdit = cfg.canEdit !== false;
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
    if (f.placeholder) attrs.placeholder = f.placeholder;
    if (f.minlength) attrs.minlength = String(f.minlength);
    if (f.autocomplete) attrs.autocomplete = f.autocomplete;
    const input = el('input', attrs);
    if (f.required) input.required = true;
    inputs[f.key] = input;
    form.append(el('label', null, f.label, input));
  });
  form.append(submit);
  if (canEdit) form.append(cancel);

  const hint = cfg.hint ? el('p', { class: 'muted', text: cfg.hint }) : null;
  const table = el('table');
  root.replaceChildren(...[form, hint, msg, table].filter(Boolean));

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
      canEdit ? btn('Edit', () => startEdit(row)) : null,
      btn(cfg.removeLabel || 'Deactivate', () => remove(row), 'secondary'),
    ].filter(Boolean));
  }

  async function remove(row) {
    const question = cfg.confirmText || 'Deactivate this record? It will be hidden, not deleted.';
    if (!confirm(question)) return;
    try {
      await api(cfg.path + '/' + row[cfg.idKey], { method: 'DELETE' });
      await load();
      refreshOps();
      say(cfg.removedMessage || 'Record deactivated.', true);
    } catch (err) {
      say(err.message, false);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    say('', true);
    const body = {};
    cfg.fields.forEach((f) => {
      const raw = inputs[f.key].value;
      const v = f.type === 'password' ? raw : raw.trim(); // never change a password by trimming it
      if (f.type === 'number') body[f.key] = v === '' ? null : Number(v);
      else body[f.key] = v === '' && !f.required ? null : v;
    });
    try {
      const saved = editingId
        ? await api(cfg.path + '/' + editingId, { method: 'PUT', body })
        : await api(cfg.path, { method: 'POST', body });
      reset();
      await load();
      refreshOps();
      say(cfg.describe && saved ? cfg.describe(saved) : 'Saved.', true);
    } catch (err) {
      say(err.message, false);
    }
  });

  load().catch((err) => say(err.message, false));
}
