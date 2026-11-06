import { addKstDays, formatKstISODate, getKstHours, kstWallToUtc } from '../kst.js';

/** 정책 창을 따로 넘기지 않을 때의 야간 귀속 구간. 전날 19:00 포함, 당일 09:00 미포함. */
export const DEFAULT_NIGHT_RECORD_WINDOW = { start: '19:00', end: '09:00' };

function parseYmd(ymd) {
  const [year, month, day] = String(ymd || '').split('-').map(Number);
  return { year, month: month - 1, day };
}

function parseHm(hm) {
  const [hour, minute] = String(hm || '00:00').split(':').map(Number);
  return { hour: hour || 0, minute: minute || 0 };
}

function wallOn(ymd, hm) {
  const { year, month, day } = parseYmd(ymd);
  const { hour, minute } = parseHm(hm);
  return kstWallToUtc(year, month, day, hour, minute);
}

function hasSignals(row) {
  if (!row) return false;
  if (row.first_signal_at || row.last_signal_at) return true;
  const kinds = row.signal_kinds;
  if (!kinds || typeof kinds !== 'object') return false;
  if (Number(kinds.rawCount) > 0) return true;
  if (Array.isArray(kinds.bundles) && kinds.bundles.length > 0) return true;
  if (Array.isArray(kinds.raw) && kinds.raw.length > 0) return true;
  return false;
}

function isShift(value) {
  return value === 'day' || value === 'night';
}

/**
 * 전날 19:00(또는 정책 시작) 이상, 당일 09:00(또는 정책 종료) 미만.
 */
export function isInNightRecordWindow(timestamp, previousWorkDate, calendarDate, nightWindow) {
  const window = nightWindow || DEFAULT_NIGHT_RECORD_WINDOW;
  const start = wallOn(previousWorkDate, window.start || DEFAULT_NIGHT_RECORD_WINDOW.start);
  const end = wallOn(calendarDate, window.end || DEFAULT_NIGHT_RECORD_WINDOW.end);
  const at = new Date(timestamp).getTime();
  if (Number.isNaN(at) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }
  return at >= start.getTime() && at < end.getTime();
}

function findRow(rows, workerName, workDate) {
  return (rows || []).find(
    (row) =>
      row &&
      row.work_date === workDate &&
      (!workerName || !row.worker_name || row.worker_name === workerName)
  );
}

/**
 * 기록 시각의 근무일·조.
 * reviewed 행이 있으면 그 행만 후보로 쓴다.
 * 전날 야간 행에 신호가 있고 시각이 야간 구간 안이면 전날 야간.
 * 아니면 달력일 행, 없으면 default_shift, 없으면 기존 08:00 근무일.
 *
 * @returns {{ workDate: string|null, shift: 'day'|'night'|null, source: 'attendance'|'default_shift'|'fallback' }}
 */
export function resolveRecordShift({
  workerName = '',
  timestamp,
  attendanceRows = [],
  defaultShift = null,
  nightWindow = DEFAULT_NIGHT_RECORD_WINDOW,
} = {}) {
  const at = new Date(timestamp);
  if (Number.isNaN(at.getTime())) {
    return { workDate: null, shift: null, source: 'fallback' };
  }

  const calendarDate = formatKstISODate(at);
  const previousDate = formatKstISODate(addKstDays(at, -1));
  const previous = findRow(attendanceRows, workerName, previousDate);
  const today = findRow(attendanceRows, workerName, calendarDate);

  const nightClaim =
    previous &&
    previous.shift === 'night' &&
    isInNightRecordWindow(at, previousDate, calendarDate, nightWindow) &&
    (previous.reviewed === true || hasSignals(previous));

  const candidates = [];
  if (nightClaim) {
    candidates.push({ workDate: previousDate, shift: 'night', reviewed: previous.reviewed === true });
  }
  if (today && isShift(today.shift)) {
    candidates.push({
      workDate: calendarDate,
      shift: today.shift,
      reviewed: today.reviewed === true,
    });
  }

  const reviewed = candidates.filter((item) => item.reviewed);
  const pool = reviewed.length ? reviewed : candidates;
  const night = pool.find((item) => item.workDate === previousDate && item.shift === 'night');
  if (night) {
    return { workDate: night.workDate, shift: 'night', source: 'attendance' };
  }
  const calendar = pool.find((item) => item.workDate === calendarDate);
  if (calendar) {
    return { workDate: calendar.workDate, shift: calendar.shift, source: 'attendance' };
  }

  if (isShift(defaultShift)) {
    return { workDate: calendarDate, shift: defaultShift, source: 'default_shift' };
  }

  const fallbackDate =
    getKstHours(at) < 8 ? formatKstISODate(addKstDays(at, -1)) : formatKstISODate(at);
  return {
    workDate: fallbackDate,
    shift: null,
    source: 'fallback',
  };
}

/** worker_name → attendance_daily 행 배열 */
export function indexAttendanceByWorker(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row?.worker_name) continue;
    const list = map.get(row.worker_name) || [];
    list.push(row);
    map.set(row.worker_name, list);
  }
  return map;
}
