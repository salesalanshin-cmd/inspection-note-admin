function pad(n) {
  return String(n).padStart(2, '0');
}

/** Date 또는 YYYY-MM-DD → YYYY-MM-DD */
export function formatISODate(date) {
  if (typeof date === 'string') return date.slice(0, 10);
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getTodayRange() {
  const today = formatISODate(new Date());
  return { start: today, end: today };
}

/** 오늘 포함 최근 N일 */
export function getRecentDaysRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return { start: formatISODate(start), end: formatISODate(end) };
}

export function getThisMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: formatISODate(start), end: formatISODate(now) };
}

export function isDateRangeValid({ start, end }) {
  if (!start || !end) return false;
  return start <= end;
}

/** 시작일·종료일 포함 일수 */
export function countDaysInRange({ start, end }) {
  if (!isDateRangeValid({ start, end })) return 0;
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

export function filterByCreatedAtDateRange(records, { start, end }) {
  if (!isDateRangeValid({ start, end })) return records;
  return records.filter((row) => {
    if (!row.created_at) return false;
    const key = formatISODate(row.created_at);
    return key >= start && key <= end;
  });
}

/** YYYY-MM-DD 문자열 배열 (시작일~종료일) */
export function eachDateInRange({ start, end }) {
  if (!isDateRangeValid({ start, end })) return [];
  const dates = [];
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cur <= last) {
    dates.push(formatISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
