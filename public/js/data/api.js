// Client-side API communication layer.
// All fetch calls to the server go through this module.
// No other module should use raw fetch('/api/...') calls.

const API_BASE = location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : '';

function headers() {
  const h = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('tm_auth_token');
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function request(method, path, body) {
  const opts = { method, headers: headers() };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);

  if (res.status === 204) return null;
  const data = await res.json();

  if (!res.ok) {
    const msg = data.message || data.error || 'Request failed';
    if (data.errors) console.warn(`API ${method} ${path} validation errors:`, JSON.stringify(data.errors, null, 2));
    throw new Error(msg);
  }
  return data;
}

export function apiGet(path) { return request('GET', path); }
export function apiPut(path, body) { return request('PUT', path, body); }
export function apiPost(path, body) { return request('POST', path, body); }
export function apiPatch(path, body) { return request('PATCH', path, body); }
export function apiDelete(path) { return request('DELETE', path); }

// Lower-level helper for callers that need to inspect the raw response
// (e.g., status code + parsed body) without throwing on non-2xx.
export async function apiRaw(method, path, body) {
  const opts = { method, headers: headers() };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  let data = null;
  if (res.status !== 204) {
    try { data = await res.json(); } catch { data = null; }
  }
  return { status: res.status, ok: res.ok, body: data };
}
