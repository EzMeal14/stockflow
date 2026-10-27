// Item IDs look like ID-001. The admin can type just a number (2 gives ID-002),
// type a full ID, or leave it empty to get the next number.

const pad = (n) => 'ID-' + String(n).padStart(3, '0');

// Returns { auto: true } for an empty value, { id } for a valid value, or { error }.
function parseItemId(input) {
  const raw = input === undefined || input === null ? '' : String(input).trim();
  if (raw === '') return { auto: true };

  // Accept the old SKU prefix for callers using a cached page during deployment.
  const match = raw.match(/^(?:(?:ID|SKU)[-\s]?)?([0-9]+)$/i);
  if (match) {
    if (match[1].length > 9) return { error: 'The ID number is too long' };
    const n = parseInt(match[1], 10);
    if (n < 1) return { error: 'The ID number must be 1 or more' };
    return { id: pad(n) };
  }

  if (/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(raw)) {
    return { id: raw.replace(/^SKU-/i, 'ID-').toUpperCase() };
  }
  return { error: 'An ID can only use letters, numbers and dashes' };
}

// The next free number after the highest ID-### already in the database.
async function nextItemId(db) {
  const rows = await db.$queryRaw`
    SELECT COALESCE(MAX(substring(id from '^ID-([0-9]{1,9})$')::int), 0)::int AS max
    FROM items
    WHERE id ~ '^ID-[0-9]{1,9}$'`;
  return pad(Number(rows[0].max) + 1);
}

module.exports = { parseItemId, nextItemId };
