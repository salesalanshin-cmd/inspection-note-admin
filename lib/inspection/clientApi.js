/**
 * 브라우저 → 점검 관리자 API (credentials 포함 쿠키 세션).
 */

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toQuery(params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    qs.set(key, String(value));
  }
  return qs.toString();
}

export async function fetchInspectionHeaders(params = {}) {
  const qs = toQuery(params);
  const res = await fetch(`/api/inspection/headers?${qs}`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });
  return parseJson(res);
}

export async function fetchInspectionHeaderDetail(id) {
  const res = await fetch(`/api/inspection/headers/${encodeURIComponent(id)}`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });
  return parseJson(res);
}

export async function fetchInspectionItems(params = {}) {
  const qs = toQuery(params);
  const res = await fetch(`/api/inspection/items?${qs}`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });
  return parseJson(res);
}

export async function createInspectionItem(body) {
  const res = await fetch('/api/inspection/items', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function patchInspectionItem(body) {
  const res = await fetch('/api/inspection/items', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}
