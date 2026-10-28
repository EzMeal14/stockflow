function validPhotoData(value) {
  return typeof value === 'string'
    && Buffer.byteLength(value, 'utf8') <= 1500000
    && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function missingPhotoColumn(err) {
  const message = String(err.message).toLowerCase();
  return (err.code === 'P2022' && message.includes('photo_data'))
    || (message.includes('photo_data')
      && (message.includes('unknown field') || message.includes('unknown arg') || message.includes('unknown argument')));
}

module.exports = { validPhotoData, missingPhotoColumn };
