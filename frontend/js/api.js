const KEY = 'bl_token';
// Live Server commonly hosts this SPA on :5500 while Flask runs on :5000.
// Keep same-origin requests for the bundled Flask deployment.
const API_BASE = window.BRIGHTLOOP_API_BASE ||
  (location.port === '5500' ? 'http://127.0.0.1:5000/api' : '/api');
export class ApiError extends Error {
  constructor(message, status, errors) { super(message); this.status = status; this.errors = errors || {}; }
}
export const token = { get: () => localStorage.getItem(KEY), set: t => localStorage.setItem(KEY, t), clear: () => localStorage.removeItem(KEY) };

const qs = p => {
  const e = Object.entries(p || {}).filter(([, v]) => v !== '' && v != null);
  return e.length ? '?' + new URLSearchParams(e).toString() : '';
};

async function req(method, url, body, asText) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token.get()) headers.Authorization = 'Bearer ' + token.get();
  let res;
  try {
    res = await fetch(API_BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new ApiError('Cannot reach the server. Check your connection and try again.', 0); }
  if (asText && res.ok) return res.text();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token.get()) { token.clear(); location.hash = '#/login'; }
    throw new ApiError(data.error || 'Something went wrong', res.status, data.errors);
  }
  return data;
}

export const api = {
  get: (u, p) => req('GET', u + qs(p)),
  text: (u) => req('GET', u, undefined, true),
  post: (u, b = {}) => req('POST', u, b),
  put: (u, b) => req('PUT', u, b),
  patch: (u, b) => req('PATCH', u, b),
  del: u => req('DELETE', u),
};
