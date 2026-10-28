// Shared helpers used by every page.
// Everything that comes from the API is shown with textContent, never as HTML.

function getToken() {
  return sessionStorage.getItem('token');
}

function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem('user'));
  } catch (e) {
    return null;
  }
}

function logout() {
  sessionStorage.clear();
  window.location.href = 'index.html';
}

// Call the API. The login token is added automatically.
async function api(path, options = {}) {
  const headers = {};
  const hasBody = options.body !== undefined;
  if (hasBody) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method: options.method || 'GET',
      headers,
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
  } catch (e) {
    throw new Error('Cannot reach the API. Check that the server is running and that CORS allows this page.');
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // no JSON body
  }

  // A bad or expired token sends the user back to the login page
  if (res.status === 401 && token) {
    logout();
    throw new Error('Your session ended. Please sign in again.');
  }
  if (!res.ok) {
    throw new Error((data && data.error) || 'Request failed (' + res.status + ')');
  }
  return data;
}

// Put this at the top of a dashboard. Sends the wrong role back to the login page.
function requireRole(role) {
  const user = getUser();
  if (!getToken() || !user || user.role !== role) {
    window.location.href = 'index.html';
    return null;
  }
  document.getElementById('who').textContent = user.firstname + ' ' + user.lastname + ' (' + user.role + ')';
  document.getElementById('logout').addEventListener('click', () => {
    if (window.confirm('Are you sure you want to log out?')) logout();
  });
  return user;
}

// ---------- small helpers to build the page safely ----------

const PROPERTY_KEYS = ['value', 'checked', 'disabled', 'hidden', 'required', 'selected'];

// el('tag', { class, text, onclick, ...attributes }, ...children)
function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) {
    Object.keys(props).forEach((key) => {
      const v = props[key];
      if (key === 'class') node.className = v;
      else if (key === 'text') node.textContent = v;
      else if (key === 'onclick') node.addEventListener('click', v);
      else if (PROPERTY_KEYS.includes(key)) node[key] = v;
      else node.setAttribute(key, v);
    });
  }
  children.flat(Infinity).forEach((c) => {
    if (c !== null && c !== undefined) node.append(c);
  });
  return node;
}

function btn(label, onclick, cls) {
  return el('button', { type: 'button', class: cls || '', onclick, text: label });
}

function indexBy(rows, key) {
  const map = {};
  rows.forEach((r) => { map[r[key]] = r; });
  return map;
}

function shortId(id) {
  return String(id || '').slice(0, 8);
}

function money(v) {
  return v === null || v === undefined || v === '' ? '' : Number(v).toFixed(2);
}

function idSortValue(value) {
  const text = String(value ?? '').trim().toUpperCase();
  const digits = text.match(/\d+/g);
  if (!digits) return text;
  return digits.map((d) => d.padStart(9, '0')).join('');
}

function sortById(rows, key = 'id') {
  return [...rows].sort((a, b) => {
    const left = idSortValue(a[key]);
    const right = idSortValue(b[key]);
    if (left < right) return -1;
    if (left > right) return 1;
    return String(a[key] ?? '').localeCompare(String(b[key] ?? ''));
  });
}

function fmtDate(s) {
  return s ? new Date(s).toLocaleString() : '';
}

function setMessage(id, text, ok) {
  const p = document.getElementById(id);
  if (!p) return;
  p.textContent = text || '';
  p.className = text ? (ok ? 'ok' : 'error') : '';
}

// columns: [{ key, label, format(value, row) }]
// actionsFn(row) returns a list of buttons. rowClassFn(row) returns a CSS class.
function fillTable(table, columns, rows, actionsFn, rowClassFn) {
  table.replaceChildren();
  const head = el('tr', null, columns.map((c) => el('th', { text: c.label, class: ['quantity', 'reorder_threshold', 'unit_price', 'quantity_change', 'total_stock'].includes(c.key) ? 'num' : '' })));
  if (actionsFn) head.append(el('th', { text: '' }));
  table.append(el('thead', null, head));

  const body = el('tbody');
  if (rows.length === 0) {
    body.append(el('tr', null,
      el('td', { colspan: String(columns.length + (actionsFn ? 1 : 0)), class: 'muted', text: 'Nothing to show yet' })));
  }
  rows.forEach((r) => {
    const tr = el('tr', { class: (rowClassFn && rowClassFn(r)) || '' });
    columns.forEach((c) => {
      const v = c.format ? c.format(r[c.key], r) : r[c.key];
      const text = v === null || v === undefined ? '' : String(v);
      const cls = ['quantity', 'reorder_threshold', 'unit_price', 'quantity_change', 'total_stock'].includes(c.key) ? 'num' : (c.key === 'id' ? 'item-id' : '');
      const td = el('td', { class: cls });
      if ((c.key === 'status' || c.key === 'movement_type') && text) {
        td.append(el('span', { class: 'pill pill-' + text.toLowerCase().replace(/[^a-z]+/g, '-'), text: text.replace(/_/g, ' ') }));
      } else {
        td.textContent = text;
      }
      tr.append(td);
    });
    if (actionsFn) {
      const td = el('td', { class: 'actions' });
      (actionsFn(r) || []).forEach((b) => td.append(b));
      tr.append(td);
    }
    body.append(tr);
  });
  table.append(body);
}

function fillSelect(select, rows, valueFn, labelFn) {
  const previous = select.value;
  select.replaceChildren();
  if (rows.length === 0) {
    select.append(el('option', { value: '', disabled: true, selected: true, text: 'None available' }));
    return;
  }
  rows.forEach((r) => select.append(el('option', { value: valueFn(r), text: labelFn(r) })));
  if (previous && rows.some((r) => valueFn(r) === previous)) select.value = previous;
}

// Show one order with its lines in a panel
async function showOrderDetail(orderId, panel, itemMap) {
  panel.replaceChildren(el('p', { class: 'muted', text: 'Loading...' }));
  try {
    const order = await api('/orders/' + orderId);
    const lines = order.items || [];
    const cols = [
      { key: 'item_id', label: 'Item', format: (v) => (itemMap[v] ? itemMap[v].name : shortId(v)) },
      { key: 'quantity', label: 'Quantity' },
    ];
    if (lines.length && lines[0].unit_price !== undefined) {
      cols.push({ key: 'unit_price', label: 'Price each', format: money });
    }
    const table = el('table');
    fillTable(table, cols, lines);
    panel.replaceChildren(
      el('h3', { text: 'Order ' + shortId(order.order_id) }),
      el('p', { text: 'Status: ' + order.status + ' | Deliver to: ' + order.delivery_address }),
      table
    );
  } catch (err) {
    panel.replaceChildren(el('p', { class: 'error', text: err.message }));
  }
}
