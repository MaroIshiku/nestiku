import { initNestikuShell } from './nestiku-shell.js';

await initNestikuShell();

const form = document.getElementById('login-form');
const button = document.getElementById('submit-btn');

function getSafeNext() {
  const params = new URLSearchParams(location.search);
  const next = params.get('next') || '/';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  button.textContent = 'Pruefe...';
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value
      })
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 428) {
      window.location.href = '/setup';
      return;
    }
    if (!response.ok) throw new Error(data.error || 'Anmeldung fehlgeschlagen');
    window.location.href = getSafeNext();
  } catch (error) {
    window.Nestiku.showToast(error.message, 'error');
    button.disabled = false;
    button.textContent = 'Anmelden';
    document.getElementById('password').select();
  }
});
