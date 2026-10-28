function openSettings() {
  if (document.getElementById('settings-dialog')) return document.getElementById('settings-dialog').showModal();

  const dialog = el('dialog', { id: 'settings-dialog', class: 'settings-dialog' });
  dialog.append(el('form', { method: 'dialog', class: 'settings-head' },
    el('div', null, el('p', { class: 'eyebrow', text: 'Account' }), el('h2', { text: 'Settings' })),
    el('button', { class: 'icon-button', type: 'submit', 'aria-label': 'Close settings', text: '×' })
  ));

  const profile = el('form', { id: 'profile-form', class: 'settings-form' },
    el('h3', { text: 'Profile' }),
    el('div', { class: 'settings-grid' },
      el('label', null, 'Email', el('input', { id: 'settings-email', type: 'email', disabled: true })),
      el('label', null, 'Contact number', el('input', { id: 'settings-contact', type: 'tel', maxlength: '20', autocomplete: 'tel' }))
    ),
    el('p', { id: 'profile-message' }),
    el('button', { type: 'submit', text: 'Save contact number' })
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

  const email = el('form', { id: 'email-request-form', class: 'settings-form' },
    el('h3', { text: 'Change email' }),
    el('p', { class: 'muted', text: 'We will send a verification code to the new address.' }),
    el('div', { class: 'settings-grid' },
      el('label', null, 'New email', el('input', { name: 'email', type: 'email', maxlength: '254', autocomplete: 'email', required: true })),
      el('label', null, 'Current password', el('input', { name: 'current_password', type: 'password', autocomplete: 'current-password', required: true }))
    ),
    el('p', { id: 'email-request-message' }),
    el('button', { type: 'submit', text: 'Send verification code' })
  );

  const confirm = el('form', { id: 'email-confirm-form', class: 'settings-form', hidden: true },
    el('h3', { text: 'Confirm new email' }),
    el('label', null, 'Verification code', el('input', { name: 'code', inputmode: 'numeric', pattern: '[0-9]{6}', maxlength: '6', autocomplete: 'one-time-code', required: true })),
    el('p', { id: 'email-confirm-message' }),
    el('button', { type: 'submit', text: 'Confirm email' })
  );

  dialog.append(profile, password, email, confirm);
  document.body.append(dialog);

  profile.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = await api('/auth/profile', { method: 'PATCH', body: { contact_number: document.getElementById('settings-contact').value } });
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

  let pendingEmail = '';
  email.addEventListener('submit', async (event) => {
    event.preventDefault();
    pendingEmail = email.elements.email.value.trim().toLowerCase();
    try {
      const data = await api('/auth/profile/email/request', { method: 'POST', body: { email: pendingEmail, current_password: email.elements.current_password.value } });
      setMessage('email-request-message', data.message, true);
      confirm.hidden = false;
      confirm.elements.code.focus();
    } catch (err) { setMessage('email-request-message', err.message, false); }
  });

  confirm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = await api('/auth/profile/email/confirm', { method: 'POST', body: { email: pendingEmail, code: confirm.elements.code.value } });
      document.getElementById('settings-email').value = data.email;
      const user = getUser(); user.email = data.email; sessionStorage.setItem('user', JSON.stringify(user));
      setMessage('email-confirm-message', data.message, true);
      confirm.reset(); email.reset(); confirm.hidden = true;
    } catch (err) { setMessage('email-confirm-message', err.message, false); }
  });

  api('/auth/me').then((profileData) => {
    document.getElementById('settings-email').value = profileData.email || '';
    document.getElementById('settings-contact').value = profileData.contact_number || '';
  }).catch((err) => setMessage('profile-message', err.message, false));

  dialog.showModal();
}

function initSettings() {
  const button = el('button', { id: 'settings-button', type: 'button', class: 'secondary', text: 'Settings' });
  button.addEventListener('click', openSettings);
  document.querySelector('.who').insertBefore(button, document.getElementById('logout'));
}

initSettings();
