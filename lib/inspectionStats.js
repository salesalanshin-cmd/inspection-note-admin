import { getWorkDateForRecord } from './analytics.js';
import { fetchAllPages } from './attendance/pagedQuery.js';
import { addKstDays, formatKstISODate, getKstHours, getKstMinutes, kstWallToUtc } from './kst.js';

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
  const workers = new Set(lines.map((line) => line.workerName).filter(Boolean));

  return {
    workday,
    companyName,
    source: lines.length ? (useApp ? 'app' : 'ocr') : null,
    inspectedQty,
    qtyGood,
    defectQty,
    defectRate: defectRate(defectQty, inspectedQty),
    workerCount: workers.size,
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
