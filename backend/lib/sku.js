// Helpers for item SKUs.
// A SKU looks like SKU-001. The admin can type just a number (2 gives SKU-002),
// type a full code, or leave it empty to get the next number.

const pad = (n) => 'SKU-' + String(n).padStart(3, '0');

// Returns { auto: true } for an empty value, { sku } for a good value, or { error }.
function parseSku(input) {
  const raw = input === undefined || input === null ? '' : String(input).trim();
  if (raw === '') return { auto: true };

  // "2", "002", "SKU2", "sku-2" and "SKU 2" all become SKU-002
  const match = raw.match(/^(?:SKU[-\s]?)?([0-9]+)$/i);
  if (match) {
    if (match[1].length > 9) return { error: 'The SKU number is too long' };
    const n = parseInt(match[1], 10);
    if (n < 1) return { error: 'The SKU number must be 1 or more' };
    return { sku: pad(n) };
  }

  if (/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(raw)) return { sku: raw.toUpperCase() };
  return { error: 'A SKU can only use letters, numbers and dashes' };
}

// The next free number after the highest SKU-### already in the database
async function nextSku(db) {
  const rows = await db.$queryRaw`
    SELECT COALESCE(MAX(substring(sku from '^SKU-([0-9]{1,9})$')::int), 0)::int AS max
    FROM items
    WHERE sku ~ '^SKU-[0-9]{1,9}$'`;
  return pad(Number(rows[0].max) + 1);
}

module.exports = { parseSku, nextSku };
