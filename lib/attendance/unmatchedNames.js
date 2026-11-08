import { getWorkDateForRecord } from '../analytics.js';
import { addKstDays, formatKstISODate, getKstDateParts, getKstHours, getKstMinutes, startOfKstDay } from '../kst.js';
import { buildWorkerDirIndex, resolveWorkerName } from './lotSources.js';

/** 미등록 이름 배너가 보는 최근 일수. KST 오늘을 포함한 달력일. */
export const UNMATCHED_NAME_LOOKBACK_DAYS = 7;

export const UNMATCHED_EMPTY_NAME = '(이름 없음)';

export const SIGNAL_TYPE_LABELS = {
  fives: '3정5S',
  frequent: '자주검사',
  defect: '불량',
  document: '문서스캔',
  lot_move: 'LOT이동',
  production: '실적',
};

const TYPE_ORDER = ['fives', 'frequent', 'defect', 'document', 'lot_move', 'production'];

function pad(n) {
  return String(n).padStart(2, '0');
}

/** 앞뒤 공백만 제거. 대소문자와 가운데 공백은 그대로다. */
export function normalizeSignalName(raw) {
  return String(raw ?? '').trim();
}

/** 빈 값과 unknown(대소문자 무시)은 한 줄로 묶는다. */
export function isBlankOrUnknownName(raw) {
  const text = normalizeSignalName(raw);
  if (!text) return true;
  return text.toLowerCase() === 'unknown';
}

export function formatKstDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const { year, month, day } = getKstDateParts(date);
  return `${year}-${pad(month + 1)}-${pad(day)} ${pad(getKstHours(date))}:${pad(getKstMinutes(date))}`;
}

/**
 * 최근 N일. 시작은 KST 오늘 00:00에서 N-1일 전(포함), 끝은 내일 00:00(미포함).
 */
export function unmatchedLookbackRange(now = new Date(), days = UNMATCHED_NAME_LOOKBACK_DAYS) {
  const count = Math.max(1, Number(days) || UNMATCHED_NAME_LOOKBACK_DAYS);
  const start = addKstDays(startOfKstDay(now), -(count - 1));
  const end = addKstDays(startOfKstDay(now), 1);
  return { start, end, days: count };
}

function directoryStatus(raw, activeIndex, inactiveIndex) {
  const activeMiss = [];
  const active = resolveWorkerName(raw, activeIndex, activeMiss);
  if (active) return { status: 'registered', name: active };
  const inactiveMiss = [];
  const inactive = resolveWorkerName(raw, inactiveIndex, inactiveMiss);
  if (inactive) return { status: 'hidden', name: normalizeSignalName(raw) };
  return { status: 'unregistered', name: null };
}

function typeLabel(byType) {
  return TYPE_ORDER
    .filter((type) => byType[type])
    .map((type) => `${SIGNAL_TYPE_LABELS[type] || type} ${byType[type]}`)
    .join(' · ');
}

function compareNames(a, b) {
  if (b.count !== a.count) return b.count - a.count;
  return a.name.localeCompare(b.name, 'ko');
}

/**
 * 신호 배열과 디렉터리를 받아 미등록·숨김/퇴사 이름을 모은다. DB 를 읽지 않는다.
 * 활성 worker_name·display_name 은 빠진다. removed·excluded 는 hidden.
 * @param {{ signals?: object[], directory?: object[], now?: Date, days?: number }} input
 */
export function summarizeUnmatchedNames({
  signals = [],
  directory = [],
  now = new Date(),
  days = UNMATCHED_NAME_LOOKBACK_DAYS,
} = {}) {
  const range = unmatchedLookbackRange(now, days);
  const activeRows = [];
  const inactiveRows = [];
  for (const row of directory || []) {
    if (row?.removed === true || row?.excluded === true) inactiveRows.push(row);
    else activeRows.push(row);
  }
  const activeIndex = buildWorkerDirIndex(activeRows);
  const inactiveIndex = buildWorkerDirIndex(inactiveRows);
  const groups = new Map();

  for (const signal of signals || []) {
    const at = new Date(signal?.at);
    if (Number.isNaN(at.getTime())) continue;
    if (at < range.start || at >= range.end) continue;
    const matched = directoryStatus(signal?.worker_name, activeIndex, inactiveIndex);
    if (matched.status === 'registered') continue;

    const blank = isBlankOrUnknownName(signal?.worker_name);
    const name = matched.status === 'hidden'
      ? matched.name
      : (blank ? UNMATCHED_EMPTY_NAME : normalizeSignalName(signal.worker_name));
    const key = `${matched.status}\t${name}`;
    const current = groups.get(key) || {
      name,
      status: matched.status,
      count: 0,
      byType: {},
      lastAt: null,
      lastWorkDate: '',
    };
    current.count += 1;
    const type = signal?.type || 'unknown';
    current.byType[type] = (current.byType[type] || 0) + 1;
    if (!current.lastAt || at > new Date(current.lastAt)) current.lastAt = at.toISOString();
    const workDate = getWorkDateForRecord(at);
    if (workDate && workDate > current.lastWorkDate) current.lastWorkDate = workDate;
    groups.set(key, current);
  }

  const rows = [...groups.values()].map((row) => ({
    ...row,
    typeLabel: typeLabel(row.byType),
    lastAtLabel: formatKstDateTime(row.lastAt),
    lastWorkDate: row.lastWorkDate || formatKstISODate(row.lastAt),
  }));

  return {
    days: range.days,
    from: formatKstISODate(range.start),
    to: formatKstISODate(addKstDays(range.end, -1)),
    unregistered: rows.filter((row) => row.status === 'unregistered').sort(compareNames),
    hidden: rows.filter((row) => row.status === 'hidden').sort(compareNames),
  };
}
