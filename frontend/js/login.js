const DASHBOARDS = {
  admin: 'admin.html',
  staff: 'staff.html',
  driver: 'driver.html',
  client: 'client.html',
};

// Already signed in? Go straight to the dashboard.
const existing = getUser();
if (getToken() && existing && DASHBOARDS[existing.role]) {
  window.location.href = DASHBOARDS[existing.role];
}

document.querySelectorAll('[data-password-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.getAttribute('aria-controls'));
    const isVisible = input.type === 'text';
    input.type = isVisible ? 'password' : 'text';
    button.textContent = isVisible ? 'Show' : 'Hide';
    button.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
    button.setAttribute('aria-pressed', String(!isVisible));
  });
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage('login-message', '', true);
  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: {
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      },
    });
    sessionStorage.setItem('token', data.token);
    sessionStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = DASHBOARDS[data.user.role] || 'index.html';
  } catch (err) {
    setMessage('login-message', err.message, false);
  }
});

// Anyone can register, but only as a client
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage('register-message', '', true);
  try {
    await api('/auth/register', {
      method: 'POST',
      body: {
        firstname: document.getElementById('reg-first').value.trim(),
        lastname: document.getElementById('reg-last').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        password: document.getElementById('reg-password').value,
      },
    });
    setMessage('register-message', 'Account created. You can sign in now.', true);
    e.target.reset();
  } catch (err) {
    setMessage('register-message', err.message, false);
  }
});
