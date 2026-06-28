import { initNestikuShell } from './nestiku-shell.js';
import { bindRegisterWindow } from './psu/setup-flow.js';

await initNestikuShell();

const form = document.getElementById('setup-form');
const submit = document.getElementById('setup-submit');
const errorCard = document.getElementById('setup-error-card');
const errorText = document.getElementById('setup-error-text');

const statusResponse = await fetch('/api/setup/status', { cache: 'no-cache' });
const status = await statusResponse.json().catch(() => ({}));
if (!status.setupRequired) {
  window.location.href = '/login';
} else if (!status.secretConfigured) {
  errorText.textContent = status.error || 'ISHIKU_SETUP_SECRET_FILE oder ISHIKU_SETUP_SECRET fehlt.';
  errorCard.hidden = false;
  form.querySelectorAll('input, button').forEach((node) => { node.disabled = true; });
}

bindRegisterWindow(form, {
  appId: 'nestiku',
  appName: 'Nestiku',
  async onSubmit(data) {
    submit.disabled = true;
    submit.textContent = 'Erstelle...';
    try {
      const response = await fetch('/api/setup/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupSecret: data.get('setup_secret'),
          displayName: data.get('admin_display_name'),
          username: data.get('admin_username'),
          email: data.get('admin_email'),
          password: data.get('admin_password'),
          passwordConfirm: data.get('admin_password_confirm')
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Setup fehlgeschlagen');
      window.Nestiku.showToast('Adminaccount erstellt.', 'success');
      window.location.href = '/';
    } catch (error) {
      window.Nestiku.showToast(error.message, 'error');
      submit.disabled = false;
      submit.textContent = 'Adminaccount erstellen';
    }
  }
});
