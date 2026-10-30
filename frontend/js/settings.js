function openSettings() {
  if (document.getElementById('settings-dialog')) return document.getElementById('settings-dialog').showModal();

  const signedInUser = getUser();
  const canEditPhoto = signedInUser && ['admin', 'driver', 'staff', 'client'].includes(signedInUser.role);
  const firstNameInput = el('input', { id: 'settings-firstname', maxlength: '200', autocomplete: 'given-name', required: true });
  const lastNameInput = el('input', { id: 'settings-lastname', maxlength: '200', autocomplete: 'family-name', required: true });
  const photoInput = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  const photoPreview = el('div', { class: 'settings-photo-preview' });
  const photoHelp = el('p', { class: 'muted settings-photo-help', text: 'Choose a JPG, PNG, or WebP photo (up to 5 MB).' });
  const removePhotoButton = el('button', { type: 'button', class: 'link-button', hidden: true, text: 'Remove photo' });
  const dialog = el('dialog', { id: 'settings-dialog', class: 'settings-dialog' });
  dialog.append(el('form', { method: 'dialog', class: 'settings-head' },
    el('div', null, el('p', { class: 'eyebrow', text: 'Account' }), el('h2', { text: 'Settings' })),
    el('button', { class: 'icon-button', type: 'submit', 'aria-label': 'Close settings', text: '×' })
  ));

  const profile = el('form', { id: 'profile-form', class: 'settings-form' },
    el('h3', { text: 'Profile' }),
    el('div', { class: 'settings-grid' },
      el('label', null, 'First name', firstNameInput),
      el('label', null, 'Last name', lastNameInput),
      el('label', null, 'Email', el('input', { id: 'settings-email', type: 'email', disabled: true })),
      el('label', null, 'Contact number', el('input', { id: 'settings-contact', type: 'tel', maxlength: '20', autocomplete: 'tel' }))
    ),
    canEditPhoto ? el('div', { class: 'settings-photo-field' },
      el('span', { class: 'field-label', text: 'Profile photo' }),
      photoPreview,
      el('label', { class: 'image-upload' }, 'Choose photo', photoInput),
      photoHelp,
      removePhotoButton
    ) : null,
    el('p', { id: 'profile-message' }),
    el('button', { type: 'submit', text: 'Save profile' })
  );

  const password = el('form', { id: 'password-form', class: 'settings-form' },
    el('h3', { text: 'Password' }),
    el('div', { class: 'settings-grid' },
      el('label', null, 'Current password', el('input', { name: 'current_password', type: 'password', autocomplete: 'current-password', required: true })),
      el('label', null, 'New password', el('input', { name: 'password', type: 'password', minlength: '8', autocomplete: 'new-password', required: true }))
    ),
    el('p', { id: 'password-message' }),
    el('button', { type: 'submit', text: 'Change password' })
  );

  dialog.append(profile, password);
  document.body.append(dialog);

  let selectedPhotoData = null;
  let removeExistingPhoto = false;
  let currentPhotoData = null;

  function setPhotoPreview(photoData) {
    photoPreview.replaceChildren(photoData
      ? el('img', { src: photoData, alt: 'Profile photo preview' })
      : el('span', { class: 'no-image-icon', 'aria-hidden': 'true' }),
      photoData ? null : el('strong', { text: 'No profile photo' }));
    removePhotoButton.hidden = !photoData;
  }

  async function compressProfilePhoto(file) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      throw new Error('Choose a JPG, PNG, or WebP image.');
    }
    if (file.size > 5 * 1024 * 1024) throw new Error('Image files must be 5 MB or smaller.');
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
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

  if (canEditPhoto) {
    photoInput.addEventListener('change', async () => {
      const file = photoInput.files[0];
      if (!file) return;
      photoInput.disabled = true;
      photoHelp.textContent = 'Processing photo...';
      try {
        selectedPhotoData = await compressProfilePhoto(file);
        if (selectedPhotoData.length > 1500000) {
          throw new Error('The compressed photo is too large. Choose a different image.');
        }
        removeExistingPhoto = false;
        setPhotoPreview(selectedPhotoData);
        removePhotoButton.hidden = false;
        photoHelp.textContent = 'Photo ready. Save your profile to apply it.';
        setMessage('profile-message', '', true);
      } catch (err) {
        photoInput.value = '';
        selectedPhotoData = null;
        setMessage('profile-message', err.message, false);
        photoHelp.textContent = 'Choose a JPG, PNG, or WebP photo (up to 5 MB).';
      } finally {
        photoInput.disabled = false;
      }
    });

    removePhotoButton.addEventListener('click', () => {
      selectedPhotoData = null;
      removeExistingPhoto = Boolean(currentPhotoData);
      photoInput.value = '';
      setPhotoPreview(null);
      photoHelp.textContent = removeExistingPhoto ? 'The photo will be removed when you save.' : 'Choose a JPG, PNG, or WebP photo (up to 5 MB).';
    });
  }

  profile.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const body = {
        firstname: firstNameInput.value,
        lastname: lastNameInput.value,
        contact_number: document.getElementById('settings-contact').value,
      };
      const photoChanged = Boolean(selectedPhotoData) || removeExistingPhoto;
      if (selectedPhotoData) body.photo_data = selectedPhotoData;
      else if (removeExistingPhoto) body.photo_data = null;
      const data = await api('/auth/profile', { method: 'PATCH', body });
      const user = getUser();
      if (user) {
        user.firstname = firstNameInput.value.trim();
        user.lastname = lastNameInput.value.trim();
        sessionStorage.setItem('user', JSON.stringify(user));
        document.getElementById('who').textContent = user.firstname + ' ' + user.lastname + ' (' + user.role + ')';
      }
      if (selectedPhotoData) currentPhotoData = selectedPhotoData;
      else if (removeExistingPhoto) currentPhotoData = null;
      selectedPhotoData = null;
      removeExistingPhoto = false;
      if (canEditPhoto && photoChanged) {
        photoInput.value = '';
        setPhotoPreview(currentPhotoData);
        photoHelp.textContent = currentPhotoData ? 'Profile photo saved.' : 'Choose a JPG, PNG, or WebP photo (up to 5 MB).';
      }
      setMessage('profile-message', data.message, true);
    } catch (err) { setMessage('profile-message', err.message, false); }
  });

  password.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = await api('/auth/profile', { method: 'PATCH', body: { current_password: password.elements.current_password.value, password: password.elements.password.value } });
      password.reset(); setMessage('password-message', data.message, true);
    } catch (err) { setMessage('password-message', err.message, false); }
  });

  api('/auth/me').then((profileData) => {
    firstNameInput.value = profileData.firstname || '';
    lastNameInput.value = profileData.lastname || '';
    document.getElementById('settings-email').value = profileData.email || '';
    document.getElementById('settings-contact').value = profileData.contact_number || '';
    if (canEditPhoto) {
      currentPhotoData = profileData.photo_data || null;
      setPhotoPreview(currentPhotoData);
    }
  }).catch((err) => setMessage('profile-message', err.message, false));

  dialog.showModal();
}

function initSettings() {
  const button = el('button', { id: 'settings-button', type: 'button', class: 'secondary', text: 'Settings' });
  button.addEventListener('click', openSettings);
  document.querySelector('.who').insertBefore(button, document.getElementById('logout'));
}

initSettings();
