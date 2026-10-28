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

  itemCrud = setupItemManager();
  setupInactiveItems();

  setupCrud({
    root: 'warehouses-root', path: '/warehouses', idKey: 'warehouse_id',
    tileLayout: true, entityName: 'warehouse', tileType: 'Warehouse', tilePlural: 'Warehouses', tileMark: 'WH',
    photoField: true,
    tileTitle: (row) => row.name,
    tileDetails: [{ key: 'address', label: 'Address' }, { key: 'city', label: 'City' }],
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
    tileLayout: true, entityName: 'vehicle', tileType: 'Vehicle', tilePlural: 'Vehicles', tileMark: 'VH',
    tileTitle: (row) => row.plate,
    tileDetails: [{ key: 'type', label: 'Type' }],
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
    tileLayout: true, entityName: 'driver', tileType: 'Driver', tilePlural: 'Drivers', tileMark: 'DR',
    photoField: true,
    tileTitle: (row) => row.firstname + ' ' + row.lastname,
    tileDetails: [{ key: 'email', label: 'Email' }, { key: 'contact_number', label: 'Contact' }],
    canEdit: false,
    removeLabel: 'Remove',
    confirmText: 'Remove this driver? The account is switched off. Past shipments stay in the history.',
    removedMessage: 'Driver removed.',
    hint: 'A new driver signs in with this email and password. A driver who still has open shipments cannot be removed.',
    fields: [
      { key: 'firstname', label: 'First name', required: true },
      { key: 'lastname', label: 'Last name', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true, pattern: '[^\\s@]+@[^\\s@]+\\.[^\\s@]+', title: 'Enter an email address without spaces', autocomplete: 'off' },
      { key: 'contact_number', label: 'Contact number', type: 'tel', required: true, placeholder: '09171234567', pattern: '\\+?[0-9 ]{7,20}', title: 'Digits only, for example 09171234567', autocomplete: 'off' },
      { key: 'password', label: 'Password (8 or more characters)', type: 'password', required: true, minlength: 8, pattern: '[^\\s]{8,}', title: 'Password must be at least 8 characters and cannot contain spaces', autocomplete: 'new-password' },
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
    tileLayout: true, entityName: 'staff member', tileType: 'Staff', tilePlural: 'Staff', tileMark: 'ST',
    photoField: true,
    tileTitle: (row) => row.firstname + ' ' + row.lastname,
    tileDetails: [
      { key: 'email', label: 'Email' },
      { key: 'contact_number', label: 'Contact' },
      { key: 'warehouse_name', label: 'Warehouse' },
    ],
    canEdit: false,
    removeLabel: 'Remove',
    confirmText: 'Remove this staff member? The account is switched off. Past records stay in the history.',
    removedMessage: 'Staff member removed.',
    hint: 'A new staff member signs in with this email and password. They only see the orders, shipments and stock of the warehouse you choose.',
    fields: [
      { key: 'firstname', label: 'First name', required: true },
      { key: 'lastname', label: 'Last name', required: true },
      { key: 'email', label: 'Email', type: 'email', required: true, pattern: '[^\\s@]+@[^\\s@]+\\.[^\\s@]+', title: 'Enter an email address without spaces', autocomplete: 'off' },
      { key: 'contact_number', label: 'Contact number', type: 'tel', required: true, placeholder: '09171234567', pattern: '\\+?[0-9 ]{7,20}', title: 'Digits only, for example 09171234567', autocomplete: 'off' },
      { key: 'password', label: 'Password (8 or more characters)', type: 'password', required: true, minlength: 8, pattern: '[^\\s]{8,}', title: 'Password must be at least 8 characters and cannot contain spaces', autocomplete: 'new-password' },
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
  initOps({ warehouseId: null, onStockChange: () => itemCrud.reloadTable() }).then((o) => { ops = o; });
}

function setupTabs() {
  const show = (name) => {
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  };
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
}

async function compressImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG, or WebP image.');
  }
  if (file.size > 5 * 1024 * 1024) throw new Error('Image files must be 5 MB or smaller.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not process this image.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    bitmap.close();
  }
}

function setupItemManager() {
  const root = document.getElementById('items-root');
  const gridRoot = document.getElementById('items-grid-root');
  const idInput = el('input', { placeholder: 'Empty = next number', autocomplete: 'off' });
  const nameInput = el('input', { required: true, maxlength: '200', autocomplete: 'off' });
  const descriptionInput = el('textarea', { rows: '3', maxlength: '2000' });
  const priceInput = el('input', { type: 'number', min: '0', step: '0.01', required: true });
  const imageInput = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  const imagePreview = el('div', { class: 'item-image-preview' });
  const imageHelp = el('p', { class: 'muted image-help', text: 'Optional: attach a JPG, PNG, or WebP image (up to 5 MB).' });
  const removeImageButton = el('button', { type: 'button', class: 'link-button image-remove', hidden: true, text: 'Remove image' });
  const formMessage = el('p');
  const grid = el('div', { class: 'item-grid' });
  const submit = el('button', { type: 'submit', text: 'Add item' });
  const cancel = el('button', { type: 'button', class: 'secondary', hidden: true, text: 'Cancel' });
  const form = el('form', { class: 'item-form' },
    el('div', { class: 'item-form-heading' },
      el('div', null, el('p', { class: 'eyebrow', text: 'Item details' }), el('h3', { text: 'Add an item' })),
      el('p', { class: 'muted', text: 'Stock quantities are managed separately in Stock.' })
    ),
    el('div', { class: 'item-form-grid' },
      el('div', { class: 'item-core-fields' },
        el('label', null, 'Item ID', idInput),
        el('label', null, 'Item name', nameInput),
        el('label', { class: 'item-description-field' }, 'Description', descriptionInput),
        el('label', null, 'Price', priceInput)
      ),
      el('div', { class: 'item-image-field' },
        el('span', { class: 'field-label', text: 'Item photo (optional)' }),
        imagePreview,
        el('label', { class: 'image-upload' }, 'Attach image', imageInput),
        imageHelp,
        removeImageButton
      )
    ),
    formMessage,
    el('div', { class: 'item-form-actions' }, submit, cancel)
  );
  const listMessage = el('p');
  const searchInput = el('input', {
    type: 'search',
    class: 'item-search-input',
    placeholder: 'Search by item name or ID',
    'aria-label': 'Search items by name or ID',
    autocomplete: 'off',
  });
  const searchStatus = el('p', { class: 'muted item-search-status', 'aria-live': 'polite' });
  const searchBar = el('div', { class: 'item-search' },
    el('label', null, 'Search items', searchInput),
    searchStatus
  );
  root.replaceChildren(form);
  gridRoot.replaceChildren(listMessage, searchBar, grid);

  let editingItem = null;
  let activeItems = [];
  let selectedImageData = null;
  let removeExistingImage = false;

  function setPreview(imageData) {
    if (imageData) {
      imagePreview.replaceChildren(el('img', { src: imageData, alt: 'Selected item photo' }));
    } else {
      imagePreview.replaceChildren(
        el('span', { class: 'no-image-icon', 'aria-hidden': 'true' }),
        el('strong', { text: 'No image' }),
        el('span', { text: 'Attach an image if available' })
      );
    }
  }

  function say(text, ok) {
    formMessage.textContent = text || '';
    formMessage.className = text ? (ok ? 'ok' : 'error') : '';
  }

  function hasDuplicateName(name) {
    const normalized = name.trim().replace(/\s+/g, ' ').toLowerCase();
    return activeItems.some((item) => item.item_id !== (editingItem && editingItem.item_id)
      && item.name.trim().replace(/\s+/g, ' ').toLowerCase() === normalized);
  }

  function reset() {
    editingItem = null;
    selectedImageData = null;
    removeExistingImage = false;
    form.reset();
    idInput.disabled = false;
    form.querySelector('.item-form-heading h3').textContent = 'Add an item';
    submit.textContent = 'Add item';
    cancel.hidden = true;
    removeImageButton.hidden = true;
    imageHelp.textContent = 'Optional: attach a JPG, PNG, or WebP image (up to 5 MB).';
    setPreview(null);
    say('', true);
  }

  function startEdit(item) {
    editingItem = item;
    selectedImageData = null;
    removeExistingImage = false;
    idInput.value = item.id || '';
    idInput.disabled = true;
    nameInput.value = item.name || '';
    descriptionInput.value = item.description || '';
    priceInput.value = item.unit_price === null || item.unit_price === undefined ? '' : item.unit_price;
    imageInput.value = '';
    setPreview(item.image_data || null);
    removeImageButton.hidden = !item.image_data;
    imageHelp.textContent = item.image_data ? 'Choose a new photo to replace this one, or remove it.' : 'Optional: attach a JPG, PNG, or WebP image (up to 5 MB).';
    form.querySelector('.item-form-heading h3').textContent = 'Edit item';
    submit.textContent = 'Save changes';
    cancel.hidden = false;
    say('', true);
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameInput.focus();
  }

  async function load() {
    const items = sortById(await api('/items/admin-catalog'), 'id');
    activeItems = items;
    renderItems();
  }

  function renderItems() {
    grid.replaceChildren();
    const query = searchInput.value.trim().toLocaleLowerCase();
    const items = activeItems.filter((item) =>
      !query
      || item.name.toLocaleLowerCase().includes(query)
      || item.id.toLocaleLowerCase().includes(query)
    );
    if (!activeItems.length) {
      searchBar.hidden = true;
      grid.append(el('div', { class: 'item-empty', text: 'No active items yet. Add your first item above.' }));
      return;
    }
    searchBar.hidden = false;
    searchStatus.textContent = query
      ? items.length + (items.length === 1 ? ' item found' : ' items found')
      : activeItems.length + (activeItems.length === 1 ? ' item' : ' items');
    if (!items.length) {
      grid.append(el('div', { class: 'item-empty', text: 'No items match your search.' }));
      return;
    }
    items.forEach((item) => {
      grid.append(renderItemTile(item, [
        btn('Edit item', () => startEdit(item), 'secondary'),
        btn('Deactivate', () => deactivate(item), 'secondary'),
      ]));
    });
  }

  async function deactivate(item) {
    if (!confirm('Deactivate "' + item.name + '"? Its ID and stock/order history will be kept.')) return;
    try {
      await api('/items/' + item.item_id, { method: 'DELETE' });
      await load();
      refreshOps();
      say('Item deactivated. Its ID was kept.', true);
    } catch (err) {
      say(err.message, false);
    }
  }

  imageInput.addEventListener('change', async () => {
    const file = imageInput.files[0];
    if (!file) return;
    submit.disabled = true;
    imageInput.disabled = true;
    imageHelp.textContent = 'Processing image...';
    try {
      selectedImageData = await compressImage(file);
      if (selectedImageData.length > 1500000) {
        throw new Error('The compressed image is too large. Choose a different image.');
      }
      removeExistingImage = false;
      setPreview(selectedImageData);
      removeImageButton.hidden = false;
      imageHelp.textContent = 'Image ready. It will be saved with the item.';
      say('', true);
    } catch (err) {
      imageInput.value = '';
      say(err.message, false);
      imageHelp.textContent = 'Optional: attach a JPG, PNG, or WebP image (up to 5 MB).';
    } finally {
      submit.disabled = false;
      imageInput.disabled = false;
    }
  });

  removeImageButton.addEventListener('click', () => {
    selectedImageData = null;
    removeExistingImage = !!editingItem;
    imageInput.value = '';
    setPreview(null);
    removeImageButton.hidden = true;
    imageHelp.textContent = 'The image will be removed when you save.';
  });

  cancel.addEventListener('click', reset);
  searchInput.addEventListener('input', renderItems);
  nameInput.addEventListener('input', () => {
    if (nameInput.value.trim() && hasDuplicateName(nameInput.value)) {
      say('Item already exists.', false);
    } else {
      say('', true);
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    say('', true);
    if (hasDuplicateName(nameInput.value)) {
      say('Item already exists.', false);
      nameInput.focus();
      return;
    }
    const body = {
      id: idInput.value.trim(),
      name: nameInput.value.trim(),
      description: descriptionInput.value.trim() || null,
      unit_price: Number(priceInput.value),
    };
    if (selectedImageData) body.image_data = selectedImageData;
    else if (removeExistingImage) body.image_data = null;
    try {
      const saved = editingItem
        ? await api('/items/' + editingItem.item_id, { method: 'PUT', body })
        : await api('/items', { method: 'POST', body });
      reset();
      await load();
      refreshOps();
      say('Saved item ' + saved.id + '.', true);
    } catch (err) {
      say(err.message, false);
    }
  });

  setPreview(null);
  load().catch((err) => {
    listMessage.textContent = err.message;
    listMessage.className = 'error';
  });
  return { reloadTable: load };
}

async function setupInactiveItems() {
  const root = document.getElementById('inactive-items-root');
  const message = document.getElementById('inactive-items-message');
  const grid = el('div', { class: 'item-grid' });
  root.replaceChildren(grid);

  async function load() {
    const rows = sortById(await api('/items/inactive'), 'id');
    grid.replaceChildren();
    if (!rows.length) {
      grid.append(el('div', { class: 'item-empty', text: 'No deactivated items.' }));
      return;
    }
    rows.forEach((row) => {
      grid.append(renderItemTile(row, [
        btn('Restore item', () => restore(row)),
      ], true));
    });
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

function renderItemTile(item, actions, inactive = false) {
  const media = item.image_data
    ? el('img', { class: 'item-card-image', src: item.image_data, alt: item.name, loading: 'lazy' })
    : el('div', { class: 'item-card-placeholder' },
      el('span', { class: 'no-image-icon', 'aria-hidden': 'true' }),
      el('strong', { text: 'No image' }),
      el('span', { text: inactive ? 'No image attached' : 'Edit item to attach an image' })
    );
  return el('article', { class: 'item-card' + (inactive ? ' item-card-inactive' : '') },
    el('div', { class: 'item-card-media' }, media),
    el('div', { class: 'item-card-content' },
      el('div', { class: 'item-card-topline' },
        el('span', { class: 'item-card-id', text: item.id }),
        el('span', { class: 'item-card-state' + (inactive ? ' is-inactive' : ''), text: inactive ? 'Deactivated' : 'Active' })
      ),
      el('h3', { text: item.name }),
      el('p', { class: 'item-card-description', text: item.description || 'No description provided.' }),
      el('div', { class: 'item-card-meta' },
        el('div', null, el('span', { text: 'Price' }), el('strong', { text: money(item.unit_price) })),
        el('div', null, el('span', { text: 'Total stock' }), el('strong', { text: String(item.total_stock || 0) }))
      ),
      el('div', { class: 'item-card-actions' }, actions)
    )
  );
}

function renderRecordTile(row, cfg, actions) {
  const photo = cfg.photoField && row.photo_data
    ? el('img', { class: 'item-card-image', src: row.photo_data, alt: cfg.tileTitle(row), loading: 'lazy' })
    : el('div', { class: 'item-card-placeholder' },
      el('span', { class: 'no-image-icon', 'aria-hidden': 'true' }),
      el('strong', { text: 'No photo' }),
      el('span', { text: 'No photo attached' })
    );
  const details = cfg.tileDetails.map((field) => {
    const raw = row[field.key];
    const value = raw === null || raw === undefined || raw === '' ? 'Not provided' : String(raw);
    return el('div', { class: 'record-detail' },
      el('span', { text: field.label }),
      el('strong', { text: value })
    );
  });
  return el('article', { class: 'item-card record-card' },
    el('div', { class: 'item-card-media record-card-media' }, cfg.photoField
      ? photo
      : el('div', null,
        el('span', { class: 'record-tile-icon', text: cfg.tileMark }),
        el('span', { class: 'record-tile-label', text: cfg.tileType })
      )),
    el('div', { class: 'item-card-content' },
      el('h3', { class: 'record-card-title', text: cfg.tileTitle(row) }),
      el('div', { class: 'record-card-details' }, details),
      el('div', { class: 'item-card-actions' }, actions)
    )
  );
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
  const isTileLayout = cfg.tileLayout === true;
  const photoKey = cfg.photoField ? 'photo_data' : null;
  let selectedPhotoData = null;
  let removeExistingPhoto = false;

  const msg = el('p');
  const say = (text, ok) => { msg.textContent = text || ''; msg.className = text ? (ok ? 'ok' : 'error') : ''; };

  const submit = el('button', { type: 'submit', text: isTileLayout ? 'Add ' + cfg.entityName : 'Add' });
  const cancel = el('button', { type: 'button', class: 'secondary', hidden: true, text: 'Cancel', onclick: reset });
  const form = el('form', { class: isTileLayout ? 'record-form' : 'row' });
  const fieldContainer = isTileLayout ? el('div', { class: 'record-form-fields' }) : form;
  if (isTileLayout) {
    form.append(el('div', { class: 'record-form-heading' },
      el('div', null,
        el('p', { class: 'eyebrow', text: 'Manage directory' }),
        el('h3', { text: 'Add a ' + cfg.entityName })
      ),
      el('span', { class: 'record-form-mark', text: cfg.tileMark })
    ));
  }
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
    fieldContainer.append(el('label', null, f.label, input));
  });
  let photoInput = null;
  let photoPreview = null;
  let photoHelp = null;
  let removePhotoButton = null;
  if (photoKey) {
    photoInput = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
    photoPreview = el('div', { class: 'item-image-preview record-photo-preview' });
    photoHelp = el('p', { class: 'muted image-help', text: 'Optional: attach a JPG, PNG, or WebP photo (up to 5 MB).' });
    removePhotoButton = el('button', { type: 'button', class: 'link-button image-remove', hidden: true, text: 'Remove photo' });
    const photoField = el('div', { class: 'record-photo-field' },
      el('span', { class: 'field-label', text: 'Photo (optional)' }),
      photoPreview,
      el('label', { class: 'image-upload' }, 'Attach photo', photoInput),
      photoHelp,
      removePhotoButton
    );
    fieldContainer.append(photoField);
  }
  if (isTileLayout) {
    form.append(fieldContainer);
    form.append(el('div', { class: 'record-form-actions' }, submit, canEdit ? cancel : null));
  } else {
    form.append(submit);
    if (canEdit) form.append(cancel);
  }

  const hint = cfg.hint ? el('p', { class: 'muted record-form-hint', text: cfg.hint }) : null;
  const table = isTileLayout ? null : el('table');
  const tileGrid = isTileLayout ? el('div', { class: 'item-grid record-grid' }) : null;
  const listing = isTileLayout
    ? el('section', { class: 'record-listing' },
      el('div', { class: 'record-listing-heading' },
        el('div', null,
          el('p', { class: 'eyebrow', text: 'Directory' }),
          el('h3', { text: cfg.tilePlural })
        ),
        el('span', { class: 'record-count', text: 'Loading...' })
      ),
      tileGrid
    )
    : table;
  root.replaceChildren(...[form, hint, msg, listing].filter(Boolean));

  function setPhotoPreview(photoData) {
    if (photoData) {
      photoPreview.replaceChildren(el('img', { src: photoData, alt: 'Selected photo' }));
    } else {
      photoPreview.replaceChildren(
        el('span', { class: 'no-image-icon', 'aria-hidden': 'true' }),
        el('strong', { text: 'No photo' }),
        el('span', { text: 'Attach a photo if available' })
      );
    }
  }

  function reset() {
    editingId = null;
    form.reset();
    selectedPhotoData = null;
    removeExistingPhoto = false;
    if (photoKey) {
      setPhotoPreview(null);
      removePhotoButton.hidden = true;
      photoHelp.textContent = 'Optional: attach a JPG, PNG, or WebP photo (up to 5 MB).';
    }
    cfg.fields.forEach((f) => {
      if (f.immutableOnEdit) inputs[f.key].disabled = false;
    });
    submit.textContent = isTileLayout ? 'Add ' + cfg.entityName : 'Add';
    cancel.hidden = true;
    if (isTileLayout) form.querySelector('.record-form-heading h3').textContent = 'Add a ' + cfg.entityName;
  }

  function startEdit(row) {
    editingId = row[cfg.idKey];
    cfg.fields.forEach((f) => {
      inputs[f.key].value = row[f.key] === null || row[f.key] === undefined ? '' : row[f.key];
      if (f.immutableOnEdit) inputs[f.key].disabled = true;
    });
    if (photoKey) {
      selectedPhotoData = null;
      removeExistingPhoto = false;
      photoInput.value = '';
      setPhotoPreview(row[photoKey] || null);
      removePhotoButton.hidden = !row[photoKey];
      photoHelp.textContent = row[photoKey]
        ? 'Choose a new photo to replace this one, or remove it.'
        : 'Optional: attach a JPG, PNG, or WebP photo (up to 5 MB).';
    }
    submit.textContent = 'Save changes';
    cancel.hidden = false;
    if (isTileLayout) {
      form.querySelector('.record-form-heading h3').textContent = 'Edit ' + cfg.entityName;
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    say('', true);
  }

  // Fill the drop-down lists of the form, for example the warehouses
  async function loadSelects() {
    for (const { field, input } of selects) {
      const rows = await api(field.optionsPath);
      fillSelect(input, rows, (r) => r[field.optionValue], field.optionLabel);
    }
  }

  if (photoKey) {
    photoInput.addEventListener('change', async () => {
      const file = photoInput.files[0];
      if (!file) return;
      submit.disabled = true;
      photoInput.disabled = true;
      photoHelp.textContent = 'Processing photo...';
      try {
        selectedPhotoData = await compressImage(file);
        if (selectedPhotoData.length > 1500000) {
          throw new Error('The compressed photo is too large. Choose a different image.');
        }
        removeExistingPhoto = false;
        setPhotoPreview(selectedPhotoData);
        removePhotoButton.hidden = false;
        photoHelp.textContent = 'Photo ready. It will be saved with this record.';
        say('', true);
      } catch (err) {
        photoInput.value = '';
        say(err.message, false);
        photoHelp.textContent = 'Optional: attach a JPG, PNG, or WebP photo (up to 5 MB).';
      } finally {
        submit.disabled = false;
        photoInput.disabled = false;
      }
    });

    removePhotoButton.addEventListener('click', () => {
      selectedPhotoData = null;
      removeExistingPhoto = !!editingId;
      photoInput.value = '';
      setPhotoPreview(null);
      removePhotoButton.hidden = true;
      photoHelp.textContent = editingId ? 'The photo will be removed when you save.' : 'Optional: attach a JPG, PNG, or WebP photo (up to 5 MB).';
    });
    setPhotoPreview(null);
  }

  async function load() {
    const rows = await api(cfg.listPath || cfg.path);
    const sortedRows = cfg.columns.some((c) => c.key === 'id') ? sortById(rows, 'id') : rows;
    if (isTileLayout) {
      tileGrid.replaceChildren();
      listing.querySelector('.record-count').textContent = String(sortedRows.length) + (sortedRows.length === 1 ? ' record' : ' records');
      if (!sortedRows.length) {
        tileGrid.append(el('div', { class: 'item-empty', text: 'No ' + cfg.tileType.toLowerCase() + ' records yet.' }));
        return;
      }
      sortedRows.forEach((row) => {
        const actions = [
          canEdit ? btn('Edit', () => startEdit(row), 'secondary') : null,
          btn(cfg.removeLabel || 'Deactivate', () => remove(row), 'secondary'),
        ].filter(Boolean);
        tileGrid.append(renderRecordTile(row, cfg, actions));
      });
    } else {
      fillTable(table, cfg.columns, sortedRows, (row) => [
        canEdit ? btn('Edit', () => startEdit(row)) : null,
        btn(cfg.removeLabel || 'Deactivate', () => remove(row), 'secondary'),
      ].filter(Boolean));
    }
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
    if (photoKey && selectedPhotoData) body[photoKey] = selectedPhotoData;
    else if (photoKey && removeExistingPhoto) body[photoKey] = null;
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

  load().catch((err) => {
    say(err.message, false);
    if (isTileLayout) listing.querySelector('.record-count').textContent = 'Unavailable';
  });
  loadSelects().catch((err) => say(err.message, false));
  return {
    reload: () => Promise.all([load(), loadSelects()]).catch((err) => say(err.message, false)),
    reloadTable: () => load(),
  };
}
