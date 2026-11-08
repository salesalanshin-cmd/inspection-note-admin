import { buildFrequentInspectionCompliance, getWorkDateForRecord } from '../analytics.js';
import { PROCESS_FILTER_ALL } from '../constants.js';
import { eachDateInRange } from '../dateRange.js';
import { addKstDays, formatKstISODate, getKstDay, getKstHours, getKstMinutes, kstWallToUtc } from '../kst.js';
import { signalRawMergedCounts } from './signalUtils.js';

/** 확인 필요. flags 와 섞지 않고 이 세 가지만 쓴다. */
export const ISSUE_NO_CLOCK_OUT = '퇴근 신호 없음 — 출근 후 기록이 이어지지 않음';
export const ISSUE_SATURDAY_UNKNOWN = '토요일 신호 없음 — 휴무 처리 여부';

export function issueShortShift(outAt, hours) {
  return `${outAt} 마지막 신호 (추정 ${hours}h) — 조퇴 여부 확인`;
}

const MONTH = /^\d{4}-\d{2}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function monthBounds(month) {
  if (!MONTH.test(String(month || ''))) {
    return { start: '', end: '' };
  }
  const [year, monthIndex] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(last).padStart(2, '0')}`,
  };
}

/** YYYY-MM-DD 의 KST 정오. 요일·근무일 계산이 서버 타임존에 끌려가지 않게 한다. */
export function kstNoon(ymd) {
  const [year, month, day] = String(ymd || '').split('-').map(Number);
  return kstWallToUtc(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

export function formatKstHm(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const hh = String(getKstHours(date)).padStart(2, '0');
  const mm = String(getKstMinutes(date)).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** 둘 다 있을 때만. 야간은 날짜를 넘기므로 타임스탬프 차이. */
export function hoursBetween(inIso, outIso) {
  if (!inIso || !outIso) return null;
  const start = new Date(inIso).getTime();
  const end = new Date(outIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return (end - start) / (60 * 60 * 1000);
}

export function roundHours1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function weekdayIndex(ymd) {
  return getKstDay(kstNoon(ymd));
}

/**
 * 행이 없을 때의 상태.
 * coveredTo 이하 → 휴무, 그 다음 오늘 이후 → future, 일요일 → 휴무,
 * 오늘(포함)까지의 월~토 → 재계산 대기.
 */
export function resolveEmptyDayStatus(date, coveredTo, today) {
  if (coveredTo && date <= coveredTo) return 'off';
  if (today && date > today) return 'future';
  if (weekdayIndex(date) === 0) return 'off';
  if ((!coveredTo || date > coveredTo) && (!today || date <= today)) return 'pending_recalc';
  return 'off';
}

/**
 * 카드 표시용 상태. 저장 판정은 바꾸지 않는다.
 * 일요일에 미확인이면 휴무로 보여 미확인·출근 분모·확인 필요에서 빠진다.
 * 일요일 출근 판정은 출근으로 둔다.
 */
export function cardStatusForRow(judgment, date) {
  if (judgment === 'present') return 'present';
  if (weekdayIndex(date) === 0) return 'off';
  return 'unknown';
}

export function buildAttendanceIssues(days) {
  const issues = [];
  for (const day of days || []) {
    if (day.status === 'present' && !day.outAt) {
      issues.push({ date: day.date, message: ISSUE_NO_CLOCK_OUT });
      continue;
    }
    if (day.status === 'present' && day.hours != null && day.hours < 8) {
      issues.push({
        date: day.date,
        message: issueShortShift(day.outAt, day.hours.toFixed(1)),
      });
      continue;
    }
    if (day.status === 'unknown' && weekdayIndex(day.date) === 6) {
      issues.push({ date: day.date, message: ISSUE_SATURDAY_UNKNOWN });
    }
  }
  return issues;
}

function confidenceOf(value) {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return null;
}

function resolveShiftKey(worker, rows) {
  if (worker?.default_shift === 'night' || worker?.default_shift === 'day') {
    return worker.default_shift;
  }
  let day = 0;
  let night = 0;
  for (const row of rows) {
    if (row?.shift === 'night') night += 1;
    else if (row?.shift === 'day') day += 1;
  }
  if (night > day) return 'night';
  return 'day';
}

function stageDone(row, stage) {
  return row?.[stage]?.done === true;
}

function inspectionForWorker({ workerName, days, goods, defects, fives, worker }) {
  const photoDates = new Set();
  for (const row of [...(goods || []), ...(defects || [])]) {
    if (row?.worker_name !== workerName || !row.created_at) continue;
    photoDates.add(getWorkDateForRecord(row.created_at));
  }

  const included = days.filter(
    (day) => day.status === 'present' || photoDates.has(day.date)
  );
  const directory = worker ? [worker] : [];
  const inspectionDays = [];
  let firstDone = 0;
  let middleDone = 0;
  let lastDone = 0;
  let fullCompliantDays = 0;

  for (const day of included) {
    const compliance = buildFrequentInspectionCompliance(
      defects || [],
      goods || [],
      fives || [],
      kstNoon(day.date),
      new Set(),
      directory,
      PROCESS_FILTER_ALL
    );
    const row = compliance.find((item) => item.worker_name === workerName);
    const first = stageDone(row, '초품');
    const middle = stageDone(row, '중품');
    const last = stageDone(row, '종품');
    if (first) firstDone += 1;
    if (middle) middleDone += 1;
    if (last) lastDone += 1;
    if (row?.allOk) fullCompliantDays += 1;
    inspectionDays.push({ date: day.date, first, middle, last });
  }

  return {
    days: inspectionDays,
    firstDone,
    middleDone,
    lastDone,
    fullCompliantDays,
    total: included.length,
  };
}

function defectSummary(defects, workerName, month) {
  const counts = new Map();
  for (const row of defects || []) {
    if (row?.worker_name !== workerName || !row.created_at) continue;
    const date = getWorkDateForRecord(row.created_at);
    if (!date.startsWith(`${month}-`)) continue;
    const subtype = String(row.defect_type || '').trim() || '미분류';
    counts.set(subtype, (counts.get(subtype) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([subtype, count]) => ({ subtype, count }))
    .sort((a, b) => b.count - a.count || a.subtype.localeCompare(b.subtype, 'ko'))
    .slice(0, 5);
}

/**
 * 근태 기록 카드. DB 를 읽지 않는다.
 * @param {object} input
 * @param {string} input.month YYYY-MM
 * @param {string} input.today KST YYYY-MM-DD. 재계산 대기와 future 의 기준일. 당일은 월~토이면 대기에 포함한다.
 * @param {string|null} input.coveredTo 회사 전체 attendance_daily 의 가장 늦은 work_date
 */
export function buildAttendanceCard({
  worker,
  month,
  today,
  coveredTo = null,
  attendanceRows = [],
  shiftTimes = { day: { start: '08:00', end: '17:00' }, night: { start: '20:00', end: '08:00' } },
  goods = [],
  defects = [],
  fives = [],
}) {
  const bounds = monthBounds(month);
  const dates = bounds.start ? eachDateInRange({ start: bounds.start, end: bounds.end }) : [];
  const workerName = String(worker?.worker_name || '').trim();
  const byDate = new Map();
  for (const row of attendanceRows || []) {
    if (!row?.work_date || row.worker_name !== workerName) continue;
    if (!row.work_date.startsWith(`${month}-`)) continue;
    byDate.set(row.work_date, row);
  }

  const monthRows = [...byDate.values()];
  const shiftKey = resolveShiftKey(worker, monthRows);
  const times = shiftTimes?.[shiftKey] || shiftTimes?.day || { start: '08:00', end: '17:00' };
  const displayName = String(worker?.display_name || '').trim() || workerName;

  const days = dates.map((date) => {
    const row = byDate.get(date);
    if (!row) {
      return {
        date,
        status: resolveEmptyDayStatus(date, coveredTo, today),
        inAt: null,
        outAt: null,
        ot: false,
        confidence: null,
        signalCount: 0,
        hours: null,
        merged: false,
        reviewed: false,
      };
    }
    const counts = signalRawMergedCounts(row.signal_kinds);
    const inAt = formatKstHm(row.estimated_clock_in);
    const outAt = formatKstHm(row.estimated_clock_out);
    const rawHours = hoursBetween(row.estimated_clock_in, row.estimated_clock_out);
    return {
      date,
      status: cardStatusForRow(row.judgment, date),
      inAt,
      outAt,
      ot: Boolean(row.is_ot),
      confidence: confidenceOf(row.confidence),
      signalCount: counts.merged,
      hours: rawHours == null ? null : roundHours1(rawHours),
      merged: Boolean(counts.hadMerge),
      reviewed: Boolean(row.reviewed),
    };
  });

  const recorded = days.filter((day) => day.status === 'present' || day.status === 'unknown');
  const confidence = { high: 0, medium: 0, low: 0 };
  let totalRaw = 0;
  for (const day of recorded) {
    if (day.confidence) confidence[day.confidence] += 1;
  }
  for (const day of days) {
    if (day.hours == null) continue;
    const row = byDate.get(day.date);
    const raw = hoursBetween(row?.estimated_clock_in, row?.estimated_clock_out);
    if (raw != null) totalRaw += raw;
  }

  const coveredEnd = coveredTo && bounds.end
    ? (coveredTo < bounds.end ? coveredTo : bounds.end)
    : bounds.start;

  const publicDays = days.map(({ merged, reviewed, ...day }) => day);

  return {
    worker: {
      id: workerName,
      name: displayName,
      employeeNo: null,
      shift: shiftKey === 'night' ? '야간' : '주간',
      shiftStart: times.start || '',
      shiftEnd: times.end || '',
    },
    month,
    coveredRange: { from: bounds.start, to: coveredEnd },
    pendingRecalcDates: days
      .filter((day) => day.status === 'pending_recalc')
      .map((day) => day.date),
    summary: {
      presentDays: days.filter((day) => day.status === 'present').length,
      recordedDays: recorded.length,
      unknownDays: days.filter((day) => day.status === 'unknown').length,
      otCount: days.filter((day) => day.ot).length,
      totalHours: roundHours1(totalRaw),
      confidence,
      mergedDays: recorded.filter((day) => day.merged).length,
      reviewed: recorded.filter((day) => day.reviewed).length,
    },
    days: publicDays,
    inspection: inspectionForWorker({
      workerName,
      days,
      goods,
      defects,
      fives,
      worker,
    }),
    defects: defectSummary(defects, workerName, month),
    issues: buildAttendanceIssues(publicDays),
  };
}

export function formatCardMonth(month) {
  if (!MONTH.test(String(month || ''))) return month || '';
  const [year, mon] = month.split('-');
  return `${year}년 ${Number(mon)}월`;
}

export function formatCardDot(ymd) {
  if (!YMD.test(String(ymd || ''))) return ymd || '';
  const [, month, day] = ymd.split('-');
  return `${month}.${day}`;
}

/** 이어진 날짜를 한 구간으로. 헤더의 "10.26 – 10.29" 용. */
export function groupConsecutiveDates(dates) {
  const sorted = [...(dates || [])].filter((date) => YMD.test(date)).sort();
  const groups = [];
  for (const date of sorted) {
    const last = groups[groups.length - 1];
    const prev = last ? nextYmd(last.to) : null;
    if (last && prev === date) last.to = date;
    else groups.push({ from: date, to: date });
  }
  return groups;
}

function nextYmd(ymd) {
  return formatKstISODate(addKstDays(kstNoon(ymd), 1));
}

export function attendanceCardPath(workerName, month) {
  const params = new URLSearchParams({
    name: String(workerName || ''),
    month: String(month || ''),
  });
  return `/attendance/card?${params.toString()}`;
}
