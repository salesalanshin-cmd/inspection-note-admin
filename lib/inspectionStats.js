import { getWorkDateForRecord } from './analytics.js';
import { fetchAllPages } from './attendance/pagedQuery.js';
import { isFactoryHoliday } from './holidays.js';
import { addKstDays, formatKstISODate, getKstDay, getKstHours, getKstMinutes, kstWallToUtc } from './kst.js';
import { summarizeReviewCorrections } from './worklogReview.js';

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const FINISH_COLUMNS = [
  'id',
  'event_type',
  'occurred_at',
  'company_id',
  'process_code',
  'lot_id',
  'worker_name',
  'qty_good',
  'qty_defect',
  'defect_breakdown',
  'start_event_id',
  'cancels_event_id',
].join(', ');

/**
 * 테스트 계정. 신성호_test 처럼 이름이 _test 로 끝나거나 test_ 로 시작한다.
 * 숨김·제외 작업자는 여기서 빼지 않는다.
 */
export function isTestWorkerName(name) {
  const text = String(name ?? '').trim();
  if (!text) return false;
  return /_test$/i.test(text) || /^test_/i.test(text);
}

/** 분모가 0이면 null. 0을 반환하지 않는다. */
export function defectRate(defectQty, inspectedQty) {
  const inspected = Number(inspectedQty);
  if (!Number.isFinite(inspected) || inspected === 0) return null;
  return Number(defectQty) / inspected;
}

function parseYmd(ymd) {
  const match = YMD.exec(String(ymd || ''));
  if (!match) throw new Error('날짜는 YYYY-MM-DD 여야 합니다.');
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

function shiftYmd(ymd, days) {
  const parts = parseYmd(ymd);
  const midnight = kstWallToUtc(parts.year, parts.month, parts.day, 0, 0, 0);
  return formatKstISODate(addKstDays(midnight, days));
}

export function addIsoDays(ymd, days) {
  return shiftYmd(ymd, days);
}

/** 시작·끝을 포함한 달력 일수. */
export function inclusiveDays(from, to) {
  const start = parseYmd(from);
  const end = parseYmd(to);
  const startMs = kstWallToUtc(start.year, start.month, start.day, 0, 0, 0).getTime();
  const endMs = kstWallToUtc(end.year, end.month, end.day, 0, 0, 0).getTime();
  return Math.round((endMs - startMs) / 86400000) + 1;
}

/** 같은 길이의 바로 앞 기간. 끝은 from 전날. */
export function previousWindow(from, to) {
  const span = inclusiveDays(from, to);
  const prevTo = shiftYmd(from, -1);
  return { from: shiftYmd(prevTo, -(span - 1)), to: prevTo };
}

export const INSPECTION_PROJECT_START = '2026-06-01';
export const DEFECT_PLAN_RATE = 0.03;
export const DEFECT_TARGET_RATE = 0.026;

export function resolveInspectionWindow({ preset = 'project', from, to, today } = {}) {
  if (!YMD.test(String(today || ''))) throw new Error('오늘 날짜가 없습니다.');
  if (preset === '30') return { preset, from: shiftYmd(today, -29), to: today };
  if (preset === 'custom') {
    if (!YMD.test(String(from || '')) || !YMD.test(String(to || '')) || from > to) {
      const error = new Error('기간은 YYYY-MM-DD 이고 시작이 끝보다 앞서야 합니다.');
      error.status = 400;
      throw error;
    }
    return { preset: 'custom', from, to };
  }
  return { preset: 'project', from: INSPECTION_PROJECT_START, to: today };
}

/** 작업일보 칸에 쉼표로 적힌 이름은 검사자 여러 명이다. */
export function splitWorkerNames(value) {
  return String(value ?? '')
    .split(/[,，]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function countWorkerNames(values) {
  const names = new Set();
  for (const value of values || []) {
    for (const name of splitWorkerNames(value)) names.add(name);
  }
  return names.size;
}

/**
 * 근무일 from 08:00 KST 이상, to 다음 날 08:00 KST 미만.
 * getWorkDateForRecord 와 같은 경계다.
 * SQL: ((occurred_at AT TIME ZONE 'Asia/Seoul') - interval '8 hours')::date
 */
export function workdayBounds(from, to) {
  const start = parseYmd(from);
  const end = parseYmd(shiftYmd(to, 1));
  return {
    start: kstWallToUtc(start.year, start.month, start.day, 8, 0, 0),
    end: kstWallToUtc(end.year, end.month, end.day, 8, 0, 0),
  };
}

function qty(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function parseDefectBreakdown(value) {
  let rows = value;
  if (typeof value === 'string') {
    try {
      rows = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      code: String(row?.code ?? '').trim(),
      qty: qty(row?.qty),
    }))
    .filter((row) => row.code && row.qty > 0);
}

/**
 * 취소(cancels_event_id)가 가리키는 finish 는 뺀다.
 * 기본으로 테스트 계정 작업자를 뺀다.
 */
export function activeFinishes(events, { excludeTestWorkers = true } = {}) {
  const cancelled = new Set();
  for (const event of events || []) {
    if (event?.event_type === 'cancel' && event.cancels_event_id) {
      cancelled.add(event.cancels_event_id);
    }
  }
  return (events || []).filter((event) => {
    if (event?.event_type !== 'finish') return false;
    if (cancelled.has(event.id)) return false;
    if (excludeTestWorkers && isTestWorkerName(event.worker_name)) return false;
    return true;
  });
}

function inRange(workday, from, to) {
  return workday >= from && workday <= to;
}

function finishFacts(event, lotsById) {
  const lot = lotsById?.get?.(event.lot_id) || null;
  const good = qty(event.qty_good);
  const defect = qty(event.qty_defect);
  return {
    event,
    workday: getWorkDateForRecord(event.occurred_at),
    processCode: String(event.process_code || '').trim(),
    lotId: event.lot_id || null,
    itemId: lot?.item_id || null,
    itemName: lot?.item_name || null,
    workerName: String(event.worker_name || '').trim(),
    good,
    defect,
    inspected: good + defect,
    breakdown: parseDefectBreakdown(event.defect_breakdown),
  };
}

function keepFact(fact, { from, to, process, item }) {
  if (!inRange(fact.workday, from, to)) return false;
  if (process && fact.processCode !== process) return false;
  if (item && fact.itemId !== item) return false;
  return true;
}

function blankDay() {
  return { inspectedQty: 0, defectQty: 0, perfCount: 0 };
}

function sealDay(workday, bucket) {
  return {
    workday,
    inspectedQty: bucket.inspectedQty,
    defectQty: bucket.defectQty,
    defectRate: defectRate(bucket.defectQty, bucket.inspectedQty),
    perfCount: bucket.perfCount,
  };
}

export function buildDailyStats(events, options = {}) {
  const finishes = activeFinishes(events, options);
  const days = new Map();
  for (const event of finishes) {
    const fact = finishFacts(event, options.lotsById);
    if (!keepFact(fact, options)) continue;
    const bucket = days.get(fact.workday) || blankDay();
    bucket.inspectedQty += fact.inspected;
    bucket.defectQty += fact.defect;
    bucket.perfCount += 1;
    days.set(fact.workday, bucket);
  }
  return [...days.keys()].sort().map((workday) => sealDay(workday, days.get(workday)));
}

export function isoWeekOf(ymd) {
  const parts = parseYmd(ymd);
  const date = new Date(Date.UTC(parts.year, parts.month, parts.day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  const monday = new Date(Date.UTC(parts.year, parts.month, parts.day));
  const mondayOffset = (monday.getUTCDay() || 7) - 1;
  monday.setUTCDate(monday.getUTCDate() - mondayOffset);
  const weekStart = formatKstISODate(monday);
  return { isoYear, isoWeek, weekStart, key: `${isoYear}-W${String(isoWeek).padStart(2, '0')}` };
}

export function buildWeeklyStats(dailyRows) {
  const weeks = new Map();
  for (const day of dailyRows || []) {
    const week = isoWeekOf(day.workday);
    const bucket = weeks.get(week.key) || {
      ...week,
      inspectedQty: 0,
      defectQty: 0,
      perfCount: 0,
    };
    bucket.inspectedQty += day.inspectedQty;
    bucket.defectQty += day.defectQty;
    bucket.perfCount += day.perfCount;
    weeks.set(week.key, bucket);
  }
  return [...weeks.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((week) => ({
      isoYear: week.isoYear,
      isoWeek: week.isoWeek,
      weekStart: week.weekStart,
      inspectedQty: week.inspectedQty,
      defectQty: week.defectQty,
      defectRate: defectRate(week.defectQty, week.inspectedQty),
      perfCount: week.perfCount,
    }));
}

function paretoFromTotals(totals, names) {
  const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const sum = ordered.reduce((total, [, count]) => total + count, 0);
  if (!sum) return [];
  let running = 0;
  return ordered.map(([code, count], index) => {
    running += count;
    const last = index === ordered.length - 1;
    return {
      code,
      name: names.get(code) || code,
      qty: count,
      ratio: count / sum,
      cumRatio: last ? 1 : running / sum,
    };
  });
}

export function buildDefectPareto(events, options = {}) {
  const names = options.defectNames instanceof Map ? options.defectNames : new Map();
  const totals = new Map();
  for (const event of activeFinishes(events, options)) {
    const fact = finishFacts(event, options.lotsById);
    if (!keepFact(fact, options)) continue;
    for (const row of fact.breakdown) {
      totals.set(row.code, (totals.get(row.code) || 0) + row.qty);
    }
  }
  return paretoFromTotals(totals, names);
}

/**
 * qty가 null이면 null. 수량 집계에서 빼고 작업일보에는 메모 행으로 남긴다.
 * qty_kind가 work가 아니면 최종검사 양식: 양품 = qty, 불량 = defect_qty.
 */
export function ocrQuantities(row) {
  if (row?.qty == null || row.qty === '') return null;
  const amount = qty(row.qty);
  const defect = qty(row.defect_qty);
  if (row.qty_kind === 'work') {
    // 작업수량이 불량 포함 총수량이라는 가정. 디케이메탈 확인 필요.
    return { inspected: amount, defect, good: amount - defect };
  }
  return { good: amount, defect, inspected: amount + defect };
}

/** 불량유형 코드. code가 없으면 raw_code. */
export function ocrDefectParts(value) {
  let rows = value;
  if (typeof value === 'string') {
    try {
      rows = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const code = String(row?.code ?? '').trim() || String(row?.raw_code ?? '').trim();
      return { code, qty: qty(row?.qty) };
    })
    .filter((row) => row.code && row.qty > 0);
}

function ocrWorkday(row) {
  const day = String(row?.work_date || '').slice(0, 10);
  return YMD.test(day) ? day : '';
}

function acceptOcrRow(row, { from, to, item, excludeTestWorkers = true } = {}) {
  if (String(row?.process_code || '').trim() !== 'IN') return false;
  if (row?.is_duplicate === true) return false;
  const day = ocrWorkday(row);
  if (!day) return false;
  if (from && to && !inRange(day, from, to)) return false;
  if (item && String(row.item_code || '') !== String(item)) return false;
  const worker = String(row.sheet_worker || row.uploader_name || '').trim();
  if (excludeTestWorkers && isTestWorkerName(worker)) return false;
  return true;
}

/** 그 근무일에 집계 대상인 앱 IN 종료가 하나라도 있으면 그날은 앱. */
function appInspectionDays(events, options = {}) {
  const days = new Set();
  if (options.process && options.process !== 'IN') return days;
  for (const event of activeFinishes(events, options)) {
    const fact = finishFacts(event, options.lotsById);
    if (fact.processCode !== 'IN') continue;
    if (!keepFact(fact, { ...options, process: 'IN' })) continue;
    days.add(fact.workday);
  }
  return days;
}

/**
 * 앱 일별에 OCR 검사행을 더한다.
 * 같은 근무일에 앱 IN 실적이 있으면 그날은 앱만 쓰고, 없으면 OCR을 쓴다.
 * 다른 공정의 앱 실적은 그대로 둔다. OCR로 검사수량을 채운 날은 source가 ocr이다.
 */
export function buildMergedDailyStats(events, ocrRows, options = {}) {
  const process = options.process || null;
  const days = new Map();
  for (const row of buildDailyStats(events, options)) {
    days.set(row.workday, {
      workday: row.workday,
      inspectedQty: row.inspectedQty,
      defectQty: row.defectQty,
      perfCount: row.perfCount,
      source: 'app',
    });
  }
  if (process && process !== 'IN') {
    return [...days.values()].map((row) => ({
      ...row,
      defectRate: defectRate(row.defectQty, row.inspectedQty),
    }));
  }
  const appInDays = appInspectionDays(events, options);
  for (const row of ocrRows || []) {
    if (!acceptOcrRow(row, options)) continue;
    const workday = ocrWorkday(row);
    if (appInDays.has(workday)) continue;
    const numbers = ocrQuantities(row);
    if (!numbers) continue;
    const bucket = days.get(workday) || {
      workday,
      inspectedQty: 0,
      defectQty: 0,
      perfCount: 0,
      source: 'ocr',
    };
    bucket.inspectedQty += numbers.inspected;
    bucket.defectQty += numbers.defect;
    bucket.perfCount += 1;
    bucket.source = 'ocr';
    days.set(workday, bucket);
  }
  return [...days.values()]
    .sort((a, b) => a.workday.localeCompare(b.workday))
    .map((row) => ({
      workday: row.workday,
      inspectedQty: row.inspectedQty,
      defectQty: row.defectQty,
      defectRate: defectRate(row.defectQty, row.inspectedQty),
      perfCount: row.perfCount,
      source: row.source,
    }));
}

export function buildMergedPareto(events, ocrRows, options = {}) {
  const names = options.defectNames instanceof Map ? options.defectNames : new Map();
  const totals = new Map();
  for (const event of activeFinishes(events, options)) {
    const fact = finishFacts(event, options.lotsById);
    if (!keepFact(fact, options)) continue;
    for (const row of fact.breakdown) {
      totals.set(row.code, (totals.get(row.code) || 0) + row.qty);
    }
  }
  if (!options.process || options.process === 'IN') {
    const appInDays = appInspectionDays(events, options);
    for (const row of ocrRows || []) {
      if (!acceptOcrRow(row, options)) continue;
      if (appInDays.has(ocrWorkday(row))) continue;
      if (!ocrQuantities(row)) continue;
      for (const part of ocrDefectParts(row.defect_breakdown)) {
        totals.set(part.code, (totals.get(part.code) || 0) + part.qty);
      }
    }
  }
  return paretoFromTotals(totals, names);
}

export function withWeekSource(dailyRows, weeks) {
  return (weeks || []).map((week) => {
    const days = (dailyRows || []).filter((day) => {
      const info = isoWeekOf(day.workday);
      return info.isoYear === week.isoYear && info.isoWeek === week.isoWeek;
    });
    const sources = new Set(days.map((day) => day.source).filter(Boolean));
    if (sources.size !== 1) return week;
    return { ...week, source: [...sources][0] };
  });
}

function clockLabel(value) {
  if (value == null || value === '') return '';
  const text = String(value).trim();
  const short = /^(\d{1,2}):(\d{2})/.exec(text);
  if (short && text.length <= 8) {
    return `${short[1].padStart(2, '0')}:${short[2]}`;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return `${String(getKstHours(date)).padStart(2, '0')}:${String(getKstMinutes(date)).padStart(2, '0')}`;
}

function namedBreakdown(parts, defectNames) {
  const names = defectNames instanceof Map ? defectNames : new Map();
  return parts.map((part) => ({
    code: part.code,
    name: names.get(part.code) || part.code,
    qty: part.qty,
  }));
}

function topDefects(lines, limit = 3) {
  const totals = new Map();
  for (const line of lines) {
    if (line.memoOnly) continue;
    for (const part of line.defectBreakdown || []) {
      const current = totals.get(part.code) || { code: part.code, name: part.name || part.code, qty: 0 };
      current.qty += part.qty;
      totals.set(part.code, current);
    }
  }
  return [...totals.values()]
    .sort((a, b) => b.qty - a.qty || a.code.localeCompare(b.code))
    .slice(0, limit);
}

/**
 * 검사공정 하루. 앱 IN 실적이 있으면 앱 행만, 없으면 OCR 행(메모 포함).
 */
export function buildInspectionReport({
  workday,
  worker = null,
  events = [],
  ocrRows = [],
  lotsById = new Map(),
  startsById = new Map(),
  defectNames = new Map(),
  excludeTestWorkers = true,
  companyName = '',
} = {}) {
  const wantedWorker = String(worker || '').trim();
  const scope = { from: workday, to: workday, excludeTestWorkers, lotsById };
  const useApp = appInspectionDays(events, scope).has(workday);
  const lines = [];

  if (useApp) {
    for (const event of activeFinishes(events, { excludeTestWorkers })) {
      const fact = finishFacts(event, lotsById);
      if (fact.workday !== workday || fact.processCode !== 'IN') continue;
      if (wantedWorker && fact.workerName !== wantedWorker) continue;
      const start = fact.event.start_event_id ? startsById.get(fact.event.start_event_id) : null;
      lines.push({
        id: fact.event.id,
        workerName: fact.workerName,
        itemCode: fact.itemId || '',
        lotNo: fact.lotId || '',
        startLabel: clockLabel(start?.occurred_at),
        endLabel: clockLabel(fact.event.occurred_at),
        qtyGood: fact.good,
        qtyDefect: fact.defect,
        inspectedQty: fact.inspected,
        defectBreakdown: namedBreakdown(fact.breakdown, defectNames),
        taskNote: '',
        source: 'app',
        reviewed: true,
        ocrResultId: null,
        memoOnly: false,
      });
    }
  } else {
    for (const row of ocrRows || []) {
      if (!acceptOcrRow(row, scope)) continue;
      const workerName = String(row.sheet_worker || row.uploader_name || '').trim();
      if (wantedWorker && workerName !== wantedWorker) continue;
      const numbers = ocrQuantities(row);
      lines.push({
        id: row.id,
        workerName,
        itemCode: row.item_code || '',
        lotNo: row.lot_no || '',
        startLabel: clockLabel(row.start_time),
        endLabel: clockLabel(row.end_time),
        qtyGood: numbers ? numbers.good : null,
        qtyDefect: numbers ? numbers.defect : null,
        inspectedQty: numbers ? numbers.inspected : null,
        defectBreakdown: namedBreakdown(ocrDefectParts(row.defect_breakdown), defectNames),
        taskNote: String(row.task_note || '').trim(),
        source: 'ocr',
        reviewed: row.needs_review !== true,
        reviewedAt: row.reviewed_at || null,
        ocrResultId: row.ocr_result_id || null,
        memoOnly: !numbers,
      });
    }
  }

  lines.sort((a, b) => (
    a.startLabel.localeCompare(b.startLabel)
    || a.workerName.localeCompare(b.workerName, 'ko')
    || String(a.itemCode).localeCompare(String(b.itemCode), 'ko')
    || String(a.id).localeCompare(String(b.id))
  ));

  const counted = lines.filter((line) => !line.memoOnly);
  const inspectedQty = counted.reduce((sum, line) => sum + line.inspectedQty, 0);
  const defectQty = counted.reduce((sum, line) => sum + line.qtyDefect, 0);
  const qtyGood = counted.reduce((sum, line) => sum + line.qtyGood, 0);
  const workers = countWorkerNames(lines.map((line) => line.workerName));

  return {
    workday,
    companyName,
    source: lines.length ? (useApp ? 'app' : 'ocr') : null,
    inspectedQty,
    qtyGood,
    defectQty,
    defectRate: defectRate(defectQty, inspectedQty),
    workerCount: workers,
    topDefects: topDefects(counted),
    lines,
  };
}

/**
 * 사진 불량의 근무일. 저장된 work_date 가 있으면 그 날짜,
 * 없으면 촬영 시각의 08:00 근무일. Step 0 SQL (c) 와 같다.
 */
export function photoWorkdayOf(row) {
  const stored = String(row?.work_date || '').slice(0, 10);
  if (YMD.test(stored)) return stored;
  if (!row?.created_at) return '';
  return getWorkDateForRecord(row.created_at);
}

export function buildPhotoDaily(rows, { from, to, excludeTestWorkers = true } = {}) {
  const days = new Map();
  for (const row of rows || []) {
    if (excludeTestWorkers && isTestWorkerName(row.worker_name)) continue;
    const workday = photoWorkdayOf(row);
    if (!workday || !inRange(workday, from, to)) continue;
    const bucket = days.get(workday) || { photoCount: 0, deletedCount: 0 };
    if (row.is_deleted === true) bucket.deletedCount += 1;
    else bucket.photoCount += 1;
    days.set(workday, bucket);
  }
  return [...days.keys()].sort().map((workday) => ({ workday, ...days.get(workday) }));
}

function processBuckets(facts, processNames) {
  const map = new Map();
  for (const fact of facts) {
    const bucket = map.get(fact.processCode) || blankDay();
    bucket.inspectedQty += fact.inspected;
    bucket.defectQty += fact.defect;
    bucket.perfCount += 1;
    map.set(fact.processCode, bucket);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, bucket]) => ({
      code,
      name: processNames?.get(code) || code,
      ...sealDay(undefined, bucket),
      workday: undefined,
    }))
    .map(({ workday, ...row }) => row);
}

function workerBuckets(facts) {
  const map = new Map();
  for (const fact of facts) {
    const key = fact.workerName || '(이름 없음)';
    const bucket = map.get(key) || blankDay();
    bucket.inspectedQty += fact.inspected;
    bucket.defectQty += fact.defect;
    bucket.perfCount += 1;
    map.set(key, bucket);
  }
  return [...map.entries()]
    .sort((a, b) => b[1].inspectedQty - a[1].inspectedQty || a[0].localeCompare(b[0], 'ko'))
    .map(([workerName, bucket]) => ({
      workerName,
      inspectedQty: bucket.inspectedQty,
      defectQty: bucket.defectQty,
      defectRate: defectRate(bucket.defectQty, bucket.inspectedQty),
      perfCount: bucket.perfCount,
    }));
}

export function buildWorkReport({
  workday,
  worker = null,
  events = [],
  photos = [],
  lotsById = new Map(),
  processNames = new Map(),
  defectNames = new Map(),
  startsById = new Map(),
  excludeTestWorkers = true,
} = {}) {
  const wantedWorker = String(worker || '').trim();
  const facts = [];
  for (const event of activeFinishes(events, { excludeTestWorkers })) {
    const fact = finishFacts(event, lotsById);
    if (fact.workday !== workday) continue;
    if (wantedWorker && fact.workerName !== wantedWorker) continue;
    facts.push(fact);
  }
  const photoRows = (photos || []).filter((row) => {
    if (excludeTestWorkers && isTestWorkerName(row.worker_name)) return false;
    if (photoWorkdayOf(row) !== workday) return false;
    if (row.is_deleted === true) return false;
    if (wantedWorker && String(row.worker_name || '').trim() !== wantedWorker) return false;
    return true;
  });
  const inspectedQty = facts.reduce((sum, fact) => sum + fact.inspected, 0);
  const defectQty = facts.reduce((sum, fact) => sum + fact.defect, 0);
  const lines = facts
    .map((fact) => {
      const start = fact.event.start_event_id ? startsById.get(fact.event.start_event_id) : null;
      return {
        eventId: fact.event.id,
        lotId: fact.lotId,
        itemId: fact.itemId,
        itemName: fact.itemName,
        processCode: fact.processCode,
        processName: processNames.get(fact.processCode) || fact.processCode,
        workerName: fact.workerName,
        startedAt: start?.occurred_at || null,
        finishedAt: fact.event.occurred_at,
        qtyGood: fact.good,
        qtyDefect: fact.defect,
        inspectedQty: fact.inspected,
        defectBreakdown: fact.breakdown.map((row) => ({
          code: row.code,
          name: defectNames.get(row.code) || row.code,
          qty: row.qty,
        })),
      };
    })
    .sort((a, b) => String(a.finishedAt).localeCompare(String(b.finishedAt)));

  return {
    workday,
    worker: wantedWorker || null,
    inspectedQty,
    defectQty,
    defectRate: defectRate(defectQty, inspectedQty),
    perfCount: facts.length,
    photoCount: photoRows.length,
    byProcess: processBuckets(facts, processNames),
    byWorker: workerBuckets(facts),
    lines,
    pareto: buildDefectPareto(
      facts.map((fact) => fact.event),
      { from: workday, to: workday, excludeTestWorkers, lotsById, defectNames }
    ),
  };
}

async function resolveCompanyId(companyId) {
  if (companyId) return companyId;
  const { getCompanyId } = await import('./company.js');
  const id = await getCompanyId();
  if (!id) throw new Error('company_id 가 없습니다.');
  return id;
}

async function readPages(buildQuery, timeColumn, label, maxPages) {
  const { rows, error, truncated } = await fetchAllPages(buildQuery, { timeColumn, label, maxPages });
  if (error) throw new Error(error.message || `${label} 조회 실패`);
  if (truncated) throw new Error(`${label} 조회가 페이지 상한에 걸렸습니다.`);
  return rows;
}

async function fetchByIds(supabase, table, column, ids, select, companyId) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const rows = [];
  for (let index = 0; index < unique.length; index += 80) {
    const slice = unique.slice(index, index + 80);
    let query = supabase.from(table).select(select).in(column, slice);
    if (companyId) query = query.eq('company_id', companyId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }
  return rows;
}

async function loadFinishBundle(supabase, companyId, from, to) {
  const bounds = workdayBounds(from, to);
  const startIso = bounds.start.toISOString();
  const endIso = bounds.end.toISOString();
  const finishes = await readPages(
    () => supabase
      .from('production_events')
      .select(FINISH_COLUMNS)
      .eq('company_id', companyId)
      .eq('event_type', 'finish')
      .gte('occurred_at', startIso)
      .lt('occurred_at', endIso),
    'occurred_at',
    'inspectionStats/finish'
  );
  const cancels = await fetchByIds(
    supabase,
    'production_events',
    'cancels_event_id',
    finishes.map((row) => row.id),
    FINISH_COLUMNS,
    companyId
  );
  const cancelRows = cancels.filter((row) => row.event_type === 'cancel');
  const starts = await fetchByIds(
    supabase,
    'production_events',
    'id',
    finishes.map((row) => row.start_event_id),
    'id, occurred_at, event_type, company_id',
    companyId
  );
  const lots = await fetchByIds(
    supabase,
    'mes_lot_master',
    'lot_id',
    finishes.map((row) => row.lot_id),
    'lot_id, item_id, item_name, is_deleted',
    companyId
  );
  const lotsById = new Map();
  for (const lot of lots) {
    const current = lotsById.get(lot.lot_id);
    if (!current || (current.is_deleted === true && lot.is_deleted !== true)) {
      lotsById.set(lot.lot_id, lot);
    }
  }
  const startsById = new Map(starts.map((row) => [row.id, row]));
  return { events: [...finishes, ...cancelRows], lotsById, startsById };
}

async function loadNames(supabase, companyId) {
  const [groups, defects] = await Promise.all([
    supabase
      .from('mes_code_table')
      .select('code, code_name, sort_order')
      .eq('company_id', companyId)
      .eq('code_type', 'OPERATION_GROUP')
      .eq('is_deleted', false),
    supabase
      .from('mes_defect_code')
      .select('defect_code, defect_name')
      .eq('company_id', companyId)
      .eq('is_deleted', false),
  ]);
  if (groups.error) throw new Error(groups.error.message);
  if (defects.error) throw new Error(defects.error.message);
  const processNames = new Map();
  const sortedGroups = [...(groups.data || [])].sort(
    (a, b) => qty(a.sort_order) - qty(b.sort_order)
  );
  for (const row of sortedGroups) {
    if (!processNames.has(row.code)) processNames.set(row.code, row.code_name);
  }
  const defectNames = new Map();
  for (const row of defects.data || []) {
    if (!defectNames.has(row.defect_code)) defectNames.set(row.defect_code, row.defect_name);
  }
  return { processNames, defectNames };
}

const WORKLOG_COLUMNS = [
  'id',
  'ocr_result_id',
  'process_code',
  'sheet_worker',
  'uploader_name',
  'work_date',
  'item_code',
  'lot_no',
  'task_note',
  'start_time',
  'end_time',
  'qty',
  'qty_kind',
  'defect_qty',
  'defect_breakdown',
  'is_duplicate',
  'needs_review',
  'reviewed_at',
].join(', ');

async function loadWorklogRows(supabase, companyId, from, to) {
  return readPages(
    () => supabase
      .from('worklog_rows')
      .select(WORKLOG_COLUMNS)
      .eq('company_id', companyId)
      .eq('process_code', 'IN')
      .eq('is_duplicate', false)
      .gte('work_date', from)
      .lte('work_date', to)
      .not('work_date', 'is', null),
    'work_date',
    'inspectionStats/worklog',
    50
  );
}

async function loadCompanyName(supabase, companyId) {
  const { data, error } = await supabase
    .from('company')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.name || '';
}

async function loadPhotos(supabase, companyId, from, to) {
  const bounds = workdayBounds(from, to);
  const columns = 'id, worker_name, created_at, work_date, is_deleted, company_id';
  const [dated, computed] = await Promise.all([
    readPages(
      () => supabase
        .from('defect_reports')
        .select(columns)
        .eq('company_id', companyId)
        .gte('work_date', from)
        .lte('work_date', to),
      'created_at',
      'inspectionStats/photos-dated'
    ),
    readPages(
      () => supabase
        .from('defect_reports')
        .select(columns)
        .eq('company_id', companyId)
        .is('work_date', null)
        .gte('created_at', bounds.start.toISOString())
        .lt('created_at', bounds.end.toISOString()),
      'created_at',
      'inspectionStats/photos-computed'
    ),
  ]);
  const byId = new Map();
  for (const row of [...dated, ...computed]) byId.set(row.id, row);
  return [...byId.values()];
}

async function clientOf(options) {
  if (options.supabase) return options.supabase;
  const mod = await import('./supabase.js');
  return mod.supabase;
}

export async function getDailyStats(options = {}) {
  const { from, to, process = null, item = null, excludeTestWorkers = true } = options;
  const companyId = await resolveCompanyId(options.companyId);
  const supabase = await clientOf(options);
  const needsOcr = !process || process === 'IN';
  const [bundle, ocrRows] = await Promise.all([
    loadFinishBundle(supabase, companyId, from, to),
    needsOcr ? loadWorklogRows(supabase, companyId, from, to) : Promise.resolve([]),
  ]);
  return buildMergedDailyStats(bundle.events, ocrRows, {
    from,
    to,
    process,
    item,
    excludeTestWorkers,
    lotsById: bundle.lotsById,
  });
}

export async function getWeeklyStats(options = {}) {
  const daily = await getDailyStats(options);
  return withWeekSource(daily, buildWeeklyStats(daily));
}

export async function getDefectPareto(options = {}) {
  const { from, to, process = null, item = null, excludeTestWorkers = true } = options;
  const companyId = await resolveCompanyId(options.companyId);
  const supabase = await clientOf(options);
  const needsOcr = !process || process === 'IN';
  const [bundle, names, ocrRows] = await Promise.all([
    loadFinishBundle(supabase, companyId, from, to),
    loadNames(supabase, companyId),
    needsOcr ? loadWorklogRows(supabase, companyId, from, to) : Promise.resolve([]),
  ]);
  return buildMergedPareto(bundle.events, ocrRows, {
    from,
    to,
    process,
    item,
    excludeTestWorkers,
    lotsById: bundle.lotsById,
    defectNames: names.defectNames,
  });
}

export async function getPhotoDailyStats(options = {}) {
  const { from, to, excludeTestWorkers = true } = options;
  const companyId = await resolveCompanyId(options.companyId);
  const photos = await loadPhotos(await clientOf(options), companyId, from, to);
  return buildPhotoDaily(photos, { from, to, excludeTestWorkers });
}

export async function getWorkReport(options = {}) {
  const { workday, worker = null, excludeTestWorkers = true } = options;
  const companyId = await resolveCompanyId(options.companyId);
  const supabase = await clientOf(options);
  const [bundle, names, ocrRows, companyName] = await Promise.all([
    loadFinishBundle(supabase, companyId, workday, workday),
    loadNames(supabase, companyId),
    loadWorklogRows(supabase, companyId, workday, workday),
    loadCompanyName(supabase, companyId),
  ]);
  return buildInspectionReport({
    workday,
    worker,
    events: bundle.events,
    ocrRows,
    lotsById: bundle.lotsById,
    startsById: bundle.startsById,
    defectNames: names.defectNames,
    excludeTestWorkers,
    companyName,
  });
}

export async function listInspectionWorkdays(options = {}) {
  const companyId = await resolveCompanyId(options.companyId);
  const supabase = await clientOf(options);
  const [ocrRows, finishes] = await Promise.all([
    readPages(
      () => supabase
        .from('worklog_rows')
        .select('id, work_date')
        .eq('company_id', companyId)
        .eq('process_code', 'IN')
        .eq('is_duplicate', false)
        .not('work_date', 'is', null),
      'work_date',
      'inspectionStats/workdays-ocr',
      50
    ),
    readPages(
      () => supabase
        .from('production_events')
        .select('id, occurred_at')
        .eq('company_id', companyId)
        .eq('event_type', 'finish')
        .eq('process_code', 'IN'),
      'occurred_at',
      'inspectionStats/workdays-app',
      50
    ),
  ]);
  const days = new Set();
  for (const row of ocrRows) {
    const day = ocrWorkday(row);
    if (day) days.add(day);
  }
  for (const row of finishes) {
    const day = getWorkDateForRecord(row.occurred_at);
    if (day) days.add(day);
  }
  return [...days].sort();
}

export async function getInspectionReportRange(options = {}) {
  const { from, to, excludeTestWorkers = true } = options;
  const companyId = await resolveCompanyId(options.companyId);
  const supabase = await clientOf(options);
  const [bundle, names, ocrRows, companyName] = await Promise.all([
    loadFinishBundle(supabase, companyId, from, to),
    loadNames(supabase, companyId),
    loadWorklogRows(supabase, companyId, from, to),
    loadCompanyName(supabase, companyId),
  ]);
  const scope = { from, to, excludeTestWorkers, lotsById: bundle.lotsById };
  const workdays = new Set(appInspectionDays(bundle.events, scope));
  for (const row of ocrRows) {
    if (!acceptOcrRow(row, scope)) continue;
    workdays.add(ocrWorkday(row));
  }
  const days = [...workdays].sort().map((workday) => {
    const report = buildInspectionReport({
      workday,
      events: bundle.events,
      ocrRows,
      lotsById: bundle.lotsById,
      startsById: bundle.startsById,
      defectNames: names.defectNames,
      excludeTestWorkers,
      companyName,
    });
    return {
      workday,
      source: report.source,
      inspectedQty: report.inspectedQty,
      qtyGood: report.qtyGood,
      defectQty: report.defectQty,
      defectRate: report.defectRate,
      workerCount: report.workerCount,
      lines: report.lines,
    };
  }).filter((day) => day.lines.length);
  return { companyName, from, to, days };
}

export function summarizeInspectionPeriod(days) {
  const list = days || [];
  const lines = [];
  let personDays = 0;
  for (const day of list) {
    const dayLines = day.lines || [];
    personDays += countWorkerNames(dayLines.map((line) => line.workerName));
    for (const line of dayLines) lines.push({ ...line, workday: day.workday });
  }
  const inspectedQty = list.reduce((sum, day) => sum + qty(day.inspectedQty), 0);
  const defectQty = list.reduce((sum, day) => sum + qty(day.defectQty), 0);
  const qtyGood = list.reduce((sum, day) => sum + qty(day.qtyGood), 0);
  const dayCount = list.length;
  return {
    inspectedQty,
    defectQty,
    qtyGood,
    defectRate: defectRate(defectQty, inspectedQty),
    dayCount,
    dailyAverage: dayCount ? inspectedQty / dayCount : null,
    personDays,
    perPersonDaily: personDays ? inspectedQty / personDays : null,
    lines,
  };
}

export function bucketInspectionDays(days, bucket = 'day') {
  if (bucket === 'day') {
    return (days || []).map((day) => ({
      key: day.workday,
      label: day.workday.slice(5),
      inspectedQty: day.inspectedQty,
      defectQty: day.defectQty,
      defectRate: day.defectRate,
    }));
  }
  const groups = new Map();
  for (const day of days || []) {
    const week = bucket === 'week' ? isoWeekOf(day.workday) : null;
    const key = week ? week.key : day.workday.slice(0, 7);
    const label = week ? week.weekStart.slice(5) : day.workday.slice(0, 7);
    const group = groups.get(key) || { key, label, inspectedQty: 0, defectQty: 0 };
    group.inspectedQty += qty(day.inspectedQty);
    group.defectQty += qty(day.defectQty);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((group) => ({
      key: group.key,
      label: group.label,
      inspectedQty: group.inspectedQty,
      defectQty: group.defectQty,
      defectRate: defectRate(group.defectQty, group.inspectedQty),
    }));
}

export function paretoFromInspectionLines(lines, limit = 10) {
  const totals = new Map();
  const names = new Map();
  for (const line of lines || []) {
    if (line.memoOnly) continue;
    for (const part of line.defectBreakdown || []) {
      if (!part?.code || !part.qty) continue;
      totals.set(part.code, (totals.get(part.code) || 0) + part.qty);
      if (part.name) names.set(part.code, part.name);
    }
  }
  return paretoFromTotals(totals, names).slice(0, limit);
}

function periodKpi(summary) {
  return {
    inspectedQty: summary.inspectedQty,
    defectQty: summary.defectQty,
    qtyGood: summary.qtyGood,
    defectRate: summary.defectRate,
    dayCount: summary.dayCount,
    dailyAverage: summary.dailyAverage,
    personDays: summary.personDays,
    perPersonDaily: summary.perPersonDaily,
  };
}

function inspectionQuality(lines) {
  const rows = (lines || []).length;
  const unreviewed = (lines || []).filter((line) => line.reviewed === false).length;
  return {
    rows,
    unreviewed,
    unreviewedRatio: rows ? unreviewed / rows : null,
    appRows: (lines || []).filter((line) => line.source === 'app').length,
    ocrRows: (lines || []).filter((line) => line.source === 'ocr').length,
  };
}

export async function getInspectionDashboard(options = {}) {
  const bucket = ['day', 'week', 'month'].includes(options.bucket) ? options.bucket : 'day';
  const { from, to } = options;
  const prev = previousWindow(from, to);
  const shared = {
    supabase: options.supabase,
    companyId: options.companyId,
    excludeTestWorkers: options.excludeTestWorkers !== false,
  };
  const [current, previous] = await Promise.all([
    getInspectionReportRange({ ...shared, from, to }),
    getInspectionReportRange({ ...shared, from: prev.from, to: prev.to }),
  ]);
  const summary = summarizeInspectionPeriod(current.days);
  const previousSummary = summarizeInspectionPeriod(previous.days);
  const recent = [...summary.lines].sort((a, b) => (
    b.workday.localeCompare(a.workday)
    || String(b.startLabel).localeCompare(String(a.startLabel))
    || String(b.id).localeCompare(String(a.id))
  )).slice(0, 10).map((line) => ({
    id: line.id,
    workday: line.workday,
    workerName: line.workerName,
    itemCode: line.itemCode,
    qtyGood: line.qtyGood,
    qtyDefect: line.qtyDefect,
    source: line.source,
  }));
  return {
    from,
    to,
    bucket,
    companyName: current.companyName,
    generatedAt: new Date().toISOString(),
    planRate: DEFECT_PLAN_RATE,
    targetRate: DEFECT_TARGET_RATE,
    kpi: periodKpi(summary),
    previous: { from: prev.from, to: prev.to, ...periodKpi(previousSummary) },
    series: bucketInspectionDays(current.days, bucket),
    pareto: paretoFromInspectionLines(summary.lines, 10),
    monthly: bucketInspectionDays(current.days, 'month'),
    recent,
    quality: inspectionQuality(summary.lines),
  };
}

export const OCR_MEASURE_FROM = '2026-11-10';
export const PRODUCTIVITY_BASELINE = 1760;
export const PRODUCTIVITY_TARGET = 2000;
export const DELIVERY_BASELINE = 0.92;
export const DELIVERY_TARGET = 0.96;

function isoWeekday(ymd) {
  const parts = parseYmd(ymd);
  return getKstDay(kstWallToUtc(parts.year, parts.month, parts.day, 12, 0, 0));
}

export function eachIsoDate(from, to) {
  const total = inclusiveDays(from, to);
  const days = [];
  let cursor = from;
  for (let index = 0; index < total; index += 1) {
    days.push(cursor);
    cursor = addIsoDays(cursor, 1);
  }
  return days;
}

/** 월~토. 일요일·공휴일은 빠진다. */
export function weekdayOperatingDays(from, to) {
  return eachIsoDate(from, to).filter((day) => {
    const weekday = isoWeekday(day);
    return weekday >= 1 && weekday <= 6 && !isFactoryHoliday(day);
  });
}

/**
 * 디지털 관리율. 출근 기록이 있는 달은 그 날을 가동일로 쓰고,
 * 없는 달은 월~토로 대체한다(공휴일 제외).
 * 분자는 가동일 가운데 검사 데이터가 있는 날이다.
 */
export function buildDigitalManagement({ from, to, digitalDays = [], attendanceDays = [] } = {}) {
  const digital = new Set(digitalDays);
  const attendance = new Set(attendanceDays);
  const months = new Map();
  for (const day of eachIsoDate(from, to)) {
    const key = day.slice(0, 7);
    const bucket = months.get(key) || { month: key, attendance: [], weekdays: [] };
    if (attendance.has(day)) bucket.attendance.push(day);
    if (isoWeekday(day) >= 1 && isoWeekday(day) <= 6 && !isFactoryHoliday(day)) {
      bucket.weekdays.push(day);
    }
    months.set(key, bucket);
  }
  const rows = [...months.values()].map((bucket) => {
    const basis = bucket.attendance.length ? 'attendance' : 'weekday';
    const operating = basis === 'attendance' ? bucket.attendance : bucket.weekdays;
    const covered = operating.filter((day) => digital.has(day)).length;
    return {
      month: bucket.month,
      basis,
      operatingDays: operating.length,
      digitalDays: covered,
      rate: operating.length ? covered / operating.length : null,
    };
  });
  const operatingDays = rows.reduce((sum, row) => sum + row.operatingDays, 0);
  const coveredDays = rows.reduce((sum, row) => sum + row.digitalDays, 0);
  const kinds = new Set(rows.map((row) => row.basis));
  let basis = 'weekday';
  if (kinds.size > 1) basis = 'mixed';
  else if (kinds.has('attendance')) basis = 'attendance';
  return {
    rate: operatingDays ? coveredDays / operatingDays : null,
    operatingDays,
    digitalDays: coveredDays,
    basis,
    months: rows,
  };
}

/** 2026-11-10 이후 촬영분만. 그 전 일괄 소급분은 뺀다. 없으면 측정 대기. */
export function ocrConfirmMinutes(pairs, { from = OCR_MEASURE_FROM } = {}) {
  const start = Date.parse(`${from}T00:00:00+09:00`);
  const minutes = [];
  for (const pair of pairs || []) {
    const captured = Date.parse(pair?.capturedAt);
    const created = Date.parse(pair?.rowCreatedAt);
    if (!Number.isFinite(captured) || !Number.isFinite(created) || captured < start) continue;
    const diff = (created - captured) / 60000;
    if (diff < 0) continue;
    minutes.push(diff);
  }
  if (!minutes.length) return { status: 'waiting', medianMinutes: null, samples: 0 };
  minutes.sort((a, b) => a - b);
  const mid = Math.floor(minutes.length / 2);
  const median = minutes.length % 2 === 1 ? minutes[mid] : (minutes[mid - 1] + minutes[mid]) / 2;
  return { status: 'measured', medianMinutes: median, samples: minutes.length };
}

export function sliceInspectionDays(days, from, to) {
  return (days || []).filter((day) => day.workday >= from && day.workday <= to);
}

export function periodSnapshot(days, from, to) {
  const summary = summarizeInspectionPeriod(sliceInspectionDays(days, from, to));
  return {
    from,
    to,
    inspectedQty: summary.inspectedQty,
    defectQty: summary.defectQty,
    defectRate: summary.defectRate,
    dayCount: summary.dayCount,
    dailyAverage: summary.dailyAverage,
    perPersonDaily: summary.perPersonDaily,
  };
}

export function monthlyProductivity(days) {
  const groups = new Map();
  for (const day of days || []) {
    const key = String(day.workday).slice(0, 7);
    const list = groups.get(key) || [];
    list.push(day);
    groups.set(key, list);
  }
  return [...groups.keys()].sort().map((month) => {
    const summary = summarizeInspectionPeriod(groups.get(month));
    return {
      month,
      dayCount: summary.dayCount,
      inspectedQty: summary.inspectedQty,
      dailyAverage: summary.dailyAverage,
      perPersonDaily: summary.perPersonDaily,
      defectRate: summary.defectRate,
    };
  });
}

async function loadAttendanceDays(supabase, companyId, from, to) {
  const rows = await readPages(
    () => supabase
      .from('attendance_daily')
      .select('id, work_date, judgment, estimated_clock_in')
      .eq('company_id', companyId)
      .gte('work_date', from)
      .lte('work_date', to),
    'work_date',
    'kpi/attendance',
    50
  );
  const days = new Set();
  for (const row of rows) {
    const day = String(row.work_date || '').slice(0, 10);
    if (!YMD.test(day)) continue;
    if (row.estimated_clock_in || row.judgment === 'present') days.add(day);
  }
  return [...days];
}

async function loadOcrLatencyPairs(supabase, companyId) {
  const start = new Date(`${OCR_MEASURE_FROM}T00:00:00+09:00`).toISOString();
  const photos = await readPages(
    () => supabase
      .from('ocr_results')
      .select('id, created_at')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .gte('created_at', start),
    'created_at',
    'kpi/ocr-photos',
    20
  );
  if (!photos.length) return [];
  const rows = await readPages(
    () => supabase
      .from('worklog_rows')
      .select('id, ocr_result_id, created_at')
      .eq('company_id', companyId)
      .gte('created_at', start),
    'created_at',
    'kpi/ocr-rows',
    20
  );
  const firstRow = new Map();
  for (const row of rows) {
    const current = firstRow.get(row.ocr_result_id);
    if (!current || String(row.created_at) < current) firstRow.set(row.ocr_result_id, row.created_at);
  }
  return photos
    .filter((photo) => firstRow.has(photo.id))
    .map((photo) => ({ capturedAt: photo.created_at, rowCreatedAt: firstRow.get(photo.id) }));
}

async function loadQtyAccuracy(supabase, companyId) {
  const reviewed = await readPages(
    () => supabase
      .from('worklog_rows')
      .select('id, reviewed_at')
      .eq('company_id', companyId)
      .not('reviewed_at', 'is', null),
    'id',
    'kpi/reviewed',
    50
  );
  const corrections = await readPages(
    () => supabase
      .from('ocr_results')
      .select('id, corrections')
      .eq('company_id', companyId)
      .not('corrections', 'is', null),
    'id',
    'kpi/corrections',
    20
  );
  return summarizeReviewCorrections(
    corrections.map((row) => row.corrections),
    reviewed.map((row) => row.id)
  );
}

function assertWindow(from, to, label) {
  if (!YMD.test(String(from || '')) || !YMD.test(String(to || '')) || from > to) {
    const error = new Error(`${label}은 YYYY-MM-DD 이고 시작이 끝보다 앞서야 합니다.`);
    error.status = 400;
    throw error;
  }
}

export async function getProjectKpi(options = {}) {
  const today = options.today || formatKstISODate(new Date());
  const from = options.from || INSPECTION_PROJECT_START;
  const to = options.to || today;
  const periodA = options.periodA || { from: '2026-06-01', to: '2026-07-31' };
  const periodB = options.periodB || { from: '2026-09-01', to: today };
  assertWindow(from, to, '기준 기간');
  assertWindow(periodA.from, periodA.to, '기간 A');
  assertWindow(periodB.from, periodB.to, '기간 B');
  const companyId = await resolveCompanyId(options.companyId);
  const supabase = await clientOf(options);
  const spanFrom = [from, periodA.from, periodB.from].sort()[0];
  const spanTo = [to, periodA.to, periodB.to].sort().at(-1);
  const [range, attendanceDays, pairs, review, companyName] = await Promise.all([
    getInspectionReportRange({ supabase, companyId, from: spanFrom, to: spanTo, excludeTestWorkers: options.excludeTestWorkers !== false }),
    loadAttendanceDays(supabase, companyId, from, to),
    loadOcrLatencyPairs(supabase, companyId),
    loadQtyAccuracy(supabase, companyId),
    loadCompanyName(supabase, companyId),
  ]);
  const baselineDays = sliceInspectionDays(range.days, from, to);
  const summary = summarizeInspectionPeriod(baselineDays);
  const quality = inspectionQuality(summary.lines);
  const reviewedDone = summary.lines.filter((line) => line.reviewedAt).length;
  const digitalDays = baselineDays.map((day) => day.workday);
  return {
    companyName,
    generatedAt: new Date().toISOString(),
    projectFrom: from,
    projectTo: to,
    planRate: DEFECT_PLAN_RATE,
    targetRate: DEFECT_TARGET_RATE,
    productivityBaseline: PRODUCTIVITY_BASELINE,
    productivityTarget: PRODUCTIVITY_TARGET,
    deliveryBaseline: DELIVERY_BASELINE,
    deliveryTarget: DELIVERY_TARGET,
    digital: buildDigitalManagement({ from, to, digitalDays, attendanceDays }),
    latency: {
      appMinutes: 0,
      ocr: ocrConfirmMinutes(pairs),
    },
    monthly: monthlyProductivity(baselineDays),
    compare: {
      a: periodSnapshot(range.days, periodA.from, periodA.to),
      b: periodSnapshot(range.days, periodB.from, periodB.to),
    },
    quality: {
      appRows: quality.appRows,
      ocrRows: quality.ocrRows,
      rows: quality.rows,
      reviewed: reviewedDone,
      reviewRate: quality.rows ? reviewedDone / quality.rows : null,
      qtyAccuracy: review.qtyAccuracy,
      reviewedRows: review.reviewedRows,
    },
    deliveryStorage: null,
  };
}
