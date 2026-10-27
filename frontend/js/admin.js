const user = requireRole('admin');

let ops = null;
let staffCrud = null;
let itemCrud = null;
// After items, warehouses, vehicles, drivers or staff change, refresh the lists used by the other tabs.
// The staff form also has a warehouse list, so it reloads when a warehouse is added or removed.
const refreshOps = () => {
  if (ops) ops.reload();
  if (staffCrud) staffCrud.reload();
};

if (user) {
  setupTabs();

  itemCrud = setupCrud({
    root: 'items-root', path: '/items', idKey: 'item_id',
    hint: 'ID: leave it empty to get the next number automatically, or type a number (2 becomes ID-002). '
      + 'An item keeps its ID when its name changes, or when it is deactivated and restored.',
    confirmText: 'Deactivate this item? Its ID and stock/order history will be kept.',
    removedMessage: 'Item deactivated. Its ID was kept.',
    listPath: '/items/admin-catalog',
    fields: [
      { key: 'id', label: 'ID', placeholder: 'Empty = next number', immutableOnEdit: true },
      { key: 'name', label: 'Name', required: true },
      { key: 'description', label: 'Description' },
      { key: 'unit_price', label: 'Price', type: 'number', step: '0.01', required: true },
    ],
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'unit_price', label: 'Price', format: money },
      { key: 'total_stock', label: 'Total stock' },
    ],
    describe: (saved) => 'Saved. ID: ' + saved.id,
  });
  setupInactiveItems();

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
      { key: 'contact_number', label: 'Contact number', type: 'tel', required: true, placeholder: '09171234567', pattern: '\\+?[0-9 ]{7,20}', title: 'Digits only, for example 09171234567', autocomplete: 'off' },
      { key: 'password', label: 'Password (8 or more characters)', type: 'password', required: true, minlength: 8, autocomplete: 'new-password' },
    ],
    columns: [
      { key: 'firstname', label: 'First name' },
      { key: 'lastname', label: 'Last name' },
      { key: 'email', label: 'Email' },
      { key: 'contact_number', label: 'Contact number' },
    ],
    describe: (saved) => 'Driver added: ' + saved.email,
  });

  // Staff accounts: add a staff member (with a warehouse), or remove one (the account is switched off, not deleted)
  staffCrud = setupCrud({
    root: 'staff-root', path: '/staff', idKey: 'user_id',
    canEdit: false,
    removeLabel: 'Remove',
    confirmText: 'Remove this staff member? The account is switched off. Past records stay in the history.',
    removedMessage: 'Staff member removed.',
    hint: 'A new staff member signs in with this email and password. They only see the orders, shipments and stock of the warehouse you choose.',
    fields: [
      { key: 'firstname', label: 'First name', required: true },
      { key: 'lastname', label: 'Last name', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'off' },
      { key: 'contact_number', label: 'Contact number', type: 'tel', required: true, placeholder: '09171234567', pattern: '\\+?[0-9 ]{7,20}', title: 'Digits only, for example 09171234567', autocomplete: 'off' },
      { key: 'password', label: 'Password (8 or more characters)', type: 'password', required: true, minlength: 8, autocomplete: 'new-password' },
      { key: 'warehouse_id', label: 'Warehouse', type: 'select', required: true,
        optionsPath: '/lookups/warehouses', optionValue: 'warehouse_id',
        optionLabel: (w) => w.name + ' (' + w.city + ')' },
    ],
    columns: [
      { key: 'firstname', label: 'First name' },
      { key: 'lastname', label: 'Last name' },
      { key: 'email', label: 'Email' },
      { key: 'contact_number', label: 'Contact number' },
      { key: 'warehouse_name', label: 'Warehouse' },
    ],
    describe: (saved) => 'Staff member added: ' + saved.email,
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

async function setupInactiveItems() {
  const root = document.getElementById('inactive-items-root');
  const message = document.getElementById('inactive-items-message');
  const table = el('table');
  root.replaceChildren(table);

  async function load() {
    const rows = sortById(await api('/items/inactive'), 'id');
    fillTable(table, [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'unit_price', label: 'Price', format: money },
      { key: 'total_stock', label: 'Total stock' },
    ], rows, (row) => [
      btn('Restore', () => restore(row), 'secondary'),
    ]);
  }

  async function restore(item) {
    const legacyArchived = item.id.startsWith('ARCHIVED-');
    const question = legacyArchived
      ? 'This item was deactivated before IDs were made stable, so its original numeric ID is unavailable. Restore it with the next available ID?'
      : 'Restore "' + item.name + '"? Its ID will be kept.';
    if (!confirm(question)) return;
    try {
      const restored = await api('/items/' + item.item_id + '/restore', { method: 'POST' });
      await Promise.all([load(), itemCrud.reloadTable()]);
      refreshOps();
      message.textContent = 'Item restored with ID ' + restored.id + '.';
      message.className = 'ok';
    } catch (err) {
      message.textContent = err.message;
      message.className = 'error';
    }
  }

  load().catch((err) => {
    message.textContent = err.message;
    message.className = 'error';
  });
}

// One form and one table to add, edit and remove records.
// The API never deletes rows. "Deactivate" and "Remove" only turn a record off.
// Options: hint, describe(saved), canEdit (default true), removeLabel, confirmText, removedMessage.
// A field with type 'select' needs optionsPath (an API list), optionValue (the id key) and optionLabel(row).
// Returns { reload } so the page can refresh the form's lists.
function setupCrud(cfg) {
  const root = document.getElementById(cfg.root);
  const canEdit = cfg.canEdit !== false;
  const inputs = {};
  const selects = [];
  let editingId = null;

  const msg = el('p');
  const say = (text, ok) => { msg.textContent = text || ''; msg.className = text ? (ok ? 'ok' : 'error') : ''; };

  const submit = el('button', { type: 'submit', text: 'Add' });
  const cancel = el('button', { type: 'button', class: 'secondary', hidden: true, text: 'Cancel', onclick: reset });
  const form = el('form', { class: 'row' });
  cfg.fields.forEach((f) => {
    let input;
    if (f.type === 'select') {
      input = el('select');
      selects.push({ field: f, input });
    } else {
      const attrs = { type: f.type || 'text' };
      if (f.type === 'number') { attrs.min = '0'; attrs.step = f.step || '1'; }
      if (f.placeholder) attrs.placeholder = f.placeholder;
      if (f.minlength) attrs.minlength = String(f.minlength);
      if (f.autocomplete) attrs.autocomplete = f.autocomplete;
      if (f.pattern) attrs.pattern = f.pattern;
      if (f.title) attrs.title = f.title;
      input = el('input', attrs);
    }
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
    cfg.fields.forEach((f) => {
      if (f.immutableOnEdit) inputs[f.key].disabled = false;
    });
    submit.textContent = 'Add';
    cancel.hidden = true;
  }

  function startEdit(row) {
    editingId = row[cfg.idKey];
    cfg.fields.forEach((f) => {
      inputs[f.key].value = row[f.key] === null || row[f.key] === undefined ? '' : row[f.key];
      if (f.immutableOnEdit) inputs[f.key].disabled = true;
    });
    submit.textContent = 'Save changes';
    cancel.hidden = false;
    say('', true);
  }

  // Fill the drop-down lists of the form, for example the warehouses
  async function loadSelects() {
    for (const { field, input } of selects) {
      const rows = await api(field.optionsPath);
      fillSelect(input, rows, (r) => r[field.optionValue], field.optionLabel);
    }
  }

  async function load() {
    const rows = await api(cfg.listPath || cfg.path);
    const sortedRows = cfg.columns.some((c) => c.key === 'id') ? sortById(rows, 'id') : rows;
    fillTable(table, cfg.columns, sortedRows, (row) => [
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
  loadSelects().catch((err) => say(err.message, false));
  return {
    reload: () => Promise.all([load(), loadSelects()]).catch((err) => say(err.message, false)),
    reloadTable: () => load(),
  };
}
