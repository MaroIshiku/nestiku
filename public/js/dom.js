export function app() { return $('#app'); }
export function $(selector, root = document) { return root.querySelector(selector); }
export function $$(selector, root = document) { return [...root.querySelectorAll(selector)]; }

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

export function escapeAttr(value) { return escapeHTML(value).replace(/`/g, '&#96;'); }

export function initials(value) {
  const parts = String(value || 'N').trim().split(/\s+/);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : parts[0].slice(0, 2)).toUpperCase();
}

export function isImage(value) {
  return /^(https?:|\/|\.{0,2}\/)/.test(value || '') || /\.(png|jpe?g|svg|webp|gif|ico)$/i.test(value || '');
}

export function iconOrText(iconValue, title) {
  return isImage(iconValue) ? `<img src="${escapeAttr(iconValue)}" alt="">` : escapeHTML(iconValue || initials(title));
}

export function safeColor(value) {
  return Number.isInteger(value) && value >= 0 && value <= 9 ? value : 0;
}

export function domain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function directUrl(query) {
  if (/\s/.test(query)) return '';
  const value = /^[a-z][a-z0-9+.-]*:\/\//i.test(query) ? query : `https://${query}`;
  try {
    const url = new URL(value);
    return url.hostname.includes('.') && ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

export function debounce(fn, ms) {
  let timer;
  return (event) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(event), ms);
  };
}

export function toast(message, type = '') {
  const node = $('#toast');
  node.textContent = message;
  node.className = `toast show ${type}`;
  clearTimeout(node.timer);
  node.timer = setTimeout(() => { node.className = 'toast'; }, 3200);
}

export function field(label, name, type = 'text', autocomplete = 'off', required = true, value = '', placeholder = '') {
  return `<label class="field"><span class="label">${label}</span><input class="input" name="${name}" type="${type}" autocomplete="${autocomplete}" ${required ? 'required' : ''} value="${escapeAttr(value ?? '')}" placeholder="${escapeAttr(placeholder)}"></label>`;
}

export function selectField(label, name, options, selected) {
  return `<label class="field"><span class="label">${label}</span><select class="select" name="${name}">${options.map(([value, text]) => `<option value="${escapeAttr(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHTML(text)}</option>`).join('')}</select></label>`;
}
