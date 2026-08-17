import {
  addKstDays,
  formatKstISODate,
  getKstDateParts,
  getKstDay,
  kstWallToUtc,
  startOfKstDay,
} from './kst';

export function startOfLocalDay(date) {
  return startOfKstDay(date);
}

/** 토(6)·일(0) 여부 (KST 달력) */
export function isWeekend(date) {
  const day = getKstDay(date);
  return day === 0 || day === 6;
}

/**
 * 주말이면 가장 가까운 이전 평일로 보정 (토→금, 일→금).
 * 평일이면 그대로 반환.
 */
export function toPreviousWeekday(date) {
  let d = startOfLocalDay(date);
  while (isWeekend(d)) {
    d = addKstDays(d, -1);
  }
  return d;
}

/**
 * 평일만 세어 날짜를 이동 (주말 건너뜀).
 * @param {Date|string|number} date
 * @param {number} delta - +1 다음 평일, -1 이전 평일
 */
export function shiftWeekday(date, delta) {
  if (!delta) return startOfLocalDay(date);
  const step = delta > 0 ? 1 : -1;
  let remaining = Math.abs(delta);
  let d = startOfLocalDay(date);
  while (remaining > 0) {
    d = addKstDays(d, step);
    if (!isWeekend(d)) remaining -= 1;
  }
  return d;
}

/**
 * 날짜를 delta일 이동. skipWeekends=true면 평일만 센다.
 * @param {Date|string|number} date
 * @param {number} delta
 * @param {{ skipWeekends?: boolean }} [options]
 */
export function shiftWorkDate(date, delta, { skipWeekends = true } = {}) {
  if (skipWeekends) return shiftWeekday(date, delta);
  if (!delta) return startOfLocalDay(date);
  return addKstDays(date, delta);
}

const YMD_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Date 또는 ISO 문자열 → KST 달력일 YYYY-MM-DD. 이미 YYYY-MM-DD면 그대로. */
export function formatISODate(date) {
  if (typeof date === 'string' && YMD_ONLY.test(date)) return date;
  return formatKstISODate(date);
}

export function getTodayRange() {
  const today = formatISODate(new Date());
  return { start: today, end: today };
}

/** 오늘 포함 최근 N일 (KST 달력) */
export function getRecentDaysRange(days) {
  const end = startOfLocalDay(new Date());
  const start = addKstDays(end, -(days - 1));
  return { start: formatISODate(start), end: formatISODate(end) };
}

export function getThisMonthRange() {
  const now = new Date();
  const { year, month } = getKstDateParts(now);
  const start = kstWallToUtc(year, month, 1);
  return { start: formatISODate(start), end: formatISODate(now) };
}

export function isDateRangeValid({ start, end }) {
  if (!start || !end) return false;
  return start <= end;
}

/** 시작일·종료일 포함 일수 (YYYY-MM-DD 달력 기준) */
export function countDaysInRange({ start, end }) {
  if (!isDateRangeValid({ start, end })) return 0;
  const s = startOfLocalDay(start);
  const e = startOfLocalDay(end);
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export function filterByCreatedAtDateRange(records, { start, end }) {
  if (!isDateRangeValid({ start, end })) return records;
  return records.filter((row) => {
    if (!row.created_at) return false;
    const key = formatISODate(row.created_at);
    return key >= start && key <= end;
  });
}

/** YYYY-MM-DD 문자열 배열 (시작일~종료일, KST 달력) */
export function eachDateInRange({ start, end }) {
  if (!isDateRangeValid({ start, end })) return [];
  const dates = [];
  let cur = startOfLocalDay(start);
  const last = startOfLocalDay(end);
  while (cur.getTime() <= last.getTime()) {
    dates.push(formatISODate(cur));
    cur = addKstDays(cur, 1);
  }
  return dates;
}
