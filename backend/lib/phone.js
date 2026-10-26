// Contact numbers: digits only, with an optional + at the start (7 to 15 digits).
// Spaces, dashes and brackets are removed. Returns the clean number, or null if it is not valid.
function cleanContactNumber(raw) {
  const value = String(raw === undefined || raw === null ? '' : raw).replace(/[\s\-()]/g, '');
  return /^\+?\d{7,15}$/.test(value) ? value : null;
}

const CONTACT_ERROR = 'A contact number is required (7 to 15 digits, for example 09171234567)';

module.exports = { cleanContactNumber, CONTACT_ERROR };
