/**
 * 근태 교대 판정.
 * 신호 구간은 attendance_policy.window_* 사용 (하드코딩 금지).
 * 우선순위: reviewed(외부) → default_shift → 최근 7일 다수 → 당일 신호 패턴
 */

import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  getKstHours,
  getKstMinutes,
  startOfKstDay,
} from '../kst.js';
import {
  ATTENDANCE_SIGNAL_QUERY,
  policyWindowEnd,
  policyWindowStart,
} from './policy.js';

export const SHIFT_DAY = 'day';
export const SHIFT_NIGHT = 'night';

export const FLAG_NEEDS_REVIEW = '확인 필요';
export const FLAG_NATIONALITY_UNSET = '국적 미설정';

function safeTrim(value) {
  if (value == null) return '';
  return String(value).trim();
}

function parseHm(hm) {
  const parts = String(hm || '00:00').split(':');
  return {
    h: Number(parts[0]) || 0,
    m: Number(parts[1]) || 0,
  };
}

function hmToMinutes(hm) {
  const { h, m } = parseHm(hm);
  return h * 60 + m;
}

/** 근무일 + HH:mm (+ dayOffset) → UTC */
export function wallTimeOnWorkDate(workDate, hm, dayOffset = 0) {
  const midnight = startOfKstDay(workDate);
  const { h, m } = parseHm(hm);
  return new Date(
    midnight.getTime() +
      dayOffset * MS_PER_DAY +
      h * MS_PER_HOUR +
      m * MS_PER_MINUTE
  );
}

export function policyTimeDayOffset(startHm, endHm) {
  return hmToMinutes(endHm) <= hmToMinutes(startHm) ? 1 : 0;
}

export function isKoreanNationality(nationality) {
  const n = safeTrim(nationality);
  return n === '한국' || n === '대한민국';
}

export function isNationalityUnset(nationality) {
  return safeTrim(nationality).length === 0;
}

/**
 * 정책 window로 [start, end) 구간 계산.
 * end <= start(분) 이면 익일 종료.
 */
export function getPolicyWindowBounds(workDate, policy) {
  const startHm = policyWindowStart(policy);
  const endHm = policyWindowEnd(policy);
  const start = wallTimeOnWorkDate(workDate, startHm, 0);
  const end = wallTimeOnWorkDate(
    workDate,
    endHm,
    policyTimeDayOffset(startHm, endHm)
  );
  return { start, end, startHm, endHm };
}

export function isInHalfOpenRange(at, start, end) {
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return false;
  return t >= start.getTime() && t < end.getTime();
}

/** D-1 17:00 ~ D+1 09:00 (ATTENDANCE_SIGNAL_QUERY) */
export function getAttendanceSignalQueryRange(workDate) {
  const q = ATTENDANCE_SIGNAL_QUERY;
  const start = wallTimeOnWorkDate(
    workDate,
    q.fromHm,
    q.fromOffsetDays
  );
  const end = wallTimeOnWorkDate(workDate, q.toHm, q.toOffsetDays);
  return { start, end };
}

/**
 * 해당 근무일(교대 시작일)의 주간/야간 구간에 속하는 신호만.
 * @param {object} dayPolicy
 * @param {object} nightPolicy
 */
export function partitionSignalsForWorkDate(
  signals,
  workDate,
  dayPolicy,
  nightPolicy
) {
  const dayWin = getPolicyWindowBounds(workDate, dayPolicy);
  const nightWin = getPolicyWindowBounds(workDate, nightPolicy);
  const daySignals = [];
  const nightSignals = [];
  for (const s of signals || []) {
    if (!s?.at) continue;
    const inDay = isInHalfOpenRange(s.at, dayWin.start, dayWin.end);
    const inNight = isInHalfOpenRange(s.at, nightWin.start, nightWin.end);
    if (inDay) daySignals.push(s);
    if (inNight) nightSignals.push(s);
  }
  return { daySignals, nightSignals, dayWin, nightWin };
}

/**
 * 교대 확정 후 그 조 구간의 신호만 사용.
 * 겹침(07~09)은 조에 따라 야간=전날 퇴근 구간 / 주간=당일 출근 구간에 포함됨.
 */
export function selectSignalsForShift(
  signals,
  workDate,
  shift,
  dayPolicy,
  nightPolicy
) {
  const { daySignals, nightSignals } = partitionSignalsForWorkDate(
    signals,
    workDate,
    dayPolicy,
    nightPolicy
  );
  const list = shift === SHIFT_NIGHT ? nightSignals : daySignals;
  return [...list].sort((a, b) => new Date(a.at) - new Date(b.at));
}

function resolveShiftBySignalPattern(
  signals,
  workDate,
  dayPolicy,
  nightPolicy
) {
  const { daySignals, nightSignals } = partitionSignalsForWorkDate(
    signals,
    workDate,
    dayPolicy,
    nightPolicy
  );
  const daySignalCount = daySignals.length;
  const nightSignalCount = nightSignals.length;

  if (nightSignalCount > daySignalCount) {
    return {
      shift: SHIFT_NIGHT,
      rule: 'signal_night_majority',
      daySignalCount,
      nightSignalCount,
    };
  }
  if (daySignalCount > nightSignalCount) {
    return {
      shift: SHIFT_DAY,
      rule: 'signal_day_majority',
      daySignalCount,
      nightSignalCount,
    };
  }

  const combined = [...daySignals, ...nightSignals]
    .filter((s, i, arr) => arr.findIndex((x) => x.at === s.at && x.type === s.type) === i)
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  if (!combined.length) {
    return {
      shift: SHIFT_DAY,
      rule: 'signal_tie_default_day',
      daySignalCount,
      nightSignalCount,
    };
  }

  const first = new Date(combined[0].at);
  const firstMinutes = getKstHours(first) * 60 + getKstMinutes(first);
  // 16:00 이후 시작이면 야간 쪽 (정책 없이 동수 타이브레이크만)
  if (firstMinutes >= 16 * 60) {
    return {
      shift: SHIFT_NIGHT,
      rule: 'signal_tie_first_after_16',
      daySignalCount,
      nightSignalCount,
    };
  }
  return {
    shift: SHIFT_DAY,
    rule: 'signal_tie_first_before_16',
    daySignalCount,
    nightSignalCount,
  };
}

function majorityRecentShift(recentShifts) {
  const list = (recentShifts || []).filter(
    (s) => s === SHIFT_DAY || s === SHIFT_NIGHT
  );
  if (!list.length) return null;
  let day = 0;
  let night = 0;
  for (const s of list) {
    if (s === SHIFT_NIGHT) night += 1;
    else day += 1;
  }
  if (night > day) return { shift: SHIFT_NIGHT, rule: 'recent_7d_night_majority' };
  if (day > night) return { shift: SHIFT_DAY, rule: 'recent_7d_day_majority' };
  return null;
}

/**
 * @param {object} opts
 * @param {Array} opts.signals — 넓은 조회 범위 신호
 * @param {string} opts.workDate
 * @param {object} opts.dayPolicy
 * @param {object} opts.nightPolicy
 * @param {string|null} [opts.nationality]
 * @param {'day'|'night'|null} [opts.defaultShift]
 * @param {Array<'day'|'night'>} [opts.recentShifts]
 */
export function resolveAttendanceShift({
  signals,
  workDate,
  dayPolicy,
  nightPolicy,
  nationality = null,
  defaultShift = null,
  recentShifts = [],
}) {
  const flags = [];
  if (isNationalityUnset(nationality)) flags.push(FLAG_NATIONALITY_UNSET);

  const { daySignals, nightSignals } = partitionSignalsForWorkDate(
    signals,
    workDate,
    dayPolicy,
    nightPolicy
  );
  const daySignalCount = daySignals.length;
  const nightSignalCount = nightSignals.length;

  let shift = null;
  let rule = null;

  // 2) directory default_shift
  if (defaultShift === SHIFT_DAY || defaultShift === SHIFT_NIGHT) {
    shift = defaultShift;
    rule = 'directory_default_shift';
  }

  // 3) recent 7d majority
  if (!shift) {
    const recent = majorityRecentShift(recentShifts);
    if (recent) {
      shift = recent.shift;
      rule = recent.rule;
    }
  }

  // 4) same-day signal pattern
  if (!shift) {
    const bySig = resolveShiftBySignalPattern(
      signals,
      workDate,
      dayPolicy,
      nightPolicy
    );
    shift = bySig.shift;
    rule = bySig.rule;
  }

  const nightOnlySignals = daySignalCount === 0 && nightSignalCount > 0;
  const korean = isKoreanNationality(nationality);

  // 야간은 외국인만. 한국인이면 주간 유지 + 확인 필요
  if (korean) {
    if (
      shift === SHIFT_NIGHT ||
      defaultShift === SHIFT_NIGHT ||
      nightOnlySignals
    ) {
      flags.push(FLAG_NEEDS_REVIEW);
    }
    shift = SHIFT_DAY;
    rule =
      defaultShift === SHIFT_NIGHT || nightOnlySignals
        ? 'korean_force_day_needs_review'
        : rule === 'directory_default_shift'
          ? 'korean_directory_day'
          : `korean_${rule || 'default_day'}`;
  }

  const sortedForMeta = selectSignalsForShift(
    signals,
    workDate,
    shift,
    dayPolicy,
    nightPolicy
  );

  return {
    shift,
    rule,
    flags: [...new Set(flags)],
    nationality: safeTrim(nationality) || null,
    daySignalCount,
    nightSignalCount,
    firstSignalAt: sortedForMeta[0]?.at || null,
    lastSignalAt: sortedForMeta[sortedForMeta.length - 1]?.at || null,
  };
}

export function resolveEstimatedClockIn(workStart, firstSignalAt, adjustMinutes = 0) {
  if (!firstSignalAt) return workStart;
  const first = new Date(firstSignalAt);
  if (Number.isNaN(first.getTime())) return workStart;
  if (first.getTime() >= workStart.getTime()) return workStart;
  const adjustMs = Math.max(0, Number(adjustMinutes) || 0) * MS_PER_MINUTE;
  if (adjustMs <= 0) return workStart;
  const earliest = new Date(workStart.getTime() - adjustMs);
  return first.getTime() >= earliest.getTime() ? first : workStart;
}

export function shiftLabel(shift) {
  if (shift === SHIFT_NIGHT) return '야간';
  if (shift === SHIFT_DAY) return '주간';
  return '—';
}

export function formatJudgmentRationaleSummary(rationale) {
  if (!rationale || typeof rationale !== 'object') return '—';
  const parts = [
    shiftLabel(rationale.shift),
    rationale.rule || null,
    `주간${rationale.daySignalCount ?? 0}/야간${rationale.nightSignalCount ?? 0}`,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** 테스트·제외 계정: excluded 또는 이름에 _test */
export function isAttendanceExcludedWorker(worker) {
  if (!worker) return true;
  if (worker.excluded === true || worker.removed === true) return true;
  const name = safeTrim(worker.worker_name);
  if (!name) return true;
  if (/_test$/i.test(name) || /^test_/i.test(name)) return true;
  return false;
}
