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

const loginForm = document.getElementById('login-form');
const forgotPasswordPanel = document.getElementById('forgot-password-panel');
const forgotPasswordForm = document.getElementById('forgot-password-form');
const resetPasswordForm = document.getElementById('reset-password-form');
let resetEmail = '';

document.getElementById('forgot-password-button').addEventListener('click', () => {
  loginForm.hidden = true;
  forgotPasswordPanel.hidden = false;
  forgotPasswordForm.hidden = false;
  resetPasswordForm.hidden = true;
  setMessage('reset-message', '', true);
  document.getElementById('reset-email').focus();
});

document.getElementById('cancel-reset-button').addEventListener('click', () => {
  forgotPasswordPanel.hidden = true;
  loginForm.hidden = false;
  forgotPasswordForm.reset();
  resetPasswordForm.reset();
  setMessage('reset-message', '', true);
});

forgotPasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  resetEmail = document.getElementById('reset-email').value.trim();
  setMessage('reset-message', '', true);
  try {
    await api('/auth/forgot-password', { method: 'POST', body: { email: resetEmail } });
    forgotPasswordForm.hidden = true;
    resetPasswordForm.hidden = false;
    setMessage('reset-message', 'Enter the 6-digit code sent to your email.', true);
    document.getElementById('reset-code').focus();
  } catch (err) {
    setMessage('reset-message', err.message, false);
  }
});

resetPasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  setMessage('reset-message', '', true);
  try {
    const data = await api('/auth/reset-password', {
      method: 'POST',
      body: {
        email: resetEmail,
        code: document.getElementById('reset-code').value,
        password: document.getElementById('reset-password').value,
      },
    });
    forgotPasswordPanel.hidden = true;
    loginForm.hidden = false;
    loginForm.reset();
    forgotPasswordForm.reset();
    resetPasswordForm.reset();
    setMessage('login-message', data.message, true);
  } catch (err) {
    setMessage('reset-message', err.message, false);
  }
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
