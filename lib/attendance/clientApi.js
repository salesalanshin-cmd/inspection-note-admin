/**
 * 브라우저 → 근태 관리자 API (credentials 포함 쿠키 세션).
 */

async function parseJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function fetchAttendanceDaily(params = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    qs.set(key, String(value));
  }
  const res = await fetch(`/api/attendance/daily?${qs.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });
  return parseJson(res);
}

export async function patchAttendanceDaily(body) {
  const res = await fetch('/api/attendance/daily', {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function applyAttendanceDailyBatch(body) {
  const res = await fetch('/api/attendance/daily', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseJson(res);
}

export async function fetchAttendanceEditLogs({ from, to }) {
  const qs = new URLSearchParams({ from, to });
  const res = await fetch(`/api/attendance/edit-log?${qs.toString()}`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });
  return parseJson(res);
}
