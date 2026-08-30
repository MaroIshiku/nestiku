let csrfToken = '';

export async function api(url, options = {}) {
  const method = options.method || 'GET';
  const headers = options.body ? { 'Content-Type': 'application/json' } : {};
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || `HTTP ${response.status}`);
    error.code = data.code || 'HTTP_ERROR';
    error.requestId = data.requestId || response.headers.get('X-Request-ID') || '';
    throw error;
  }
  if (typeof data.csrfToken === 'string') csrfToken = data.csrfToken;
  if (url === '/api/logout') csrfToken = '';
  return data;
}
