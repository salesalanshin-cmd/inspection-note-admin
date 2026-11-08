import { getWorkDateForRecord } from './analytics.js';
import { fetchAllPages } from './attendance/pagedQuery.js';
import { addKstDays, formatKstISODate, kstWallToUtc } from './kst.js';

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

async function readPages(buildQuery, timeColumn, label) {
  const { rows, error, truncated } = await fetchAllPages(buildQuery, { timeColumn, label });
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
  const bundle = await loadFinishBundle(supabase, companyId, from, to);
  return buildDailyStats(bundle.events, {
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
  return buildWeeklyStats(daily);
}

export async function getDefectPareto(options = {}) {
  const { from, to, process = null, item = null, excludeTestWorkers = true } = options;
  const companyId = await resolveCompanyId(options.companyId);
  const supabase = await clientOf(options);
  const [bundle, names] = await Promise.all([
    loadFinishBundle(supabase, companyId, from, to),
    loadNames(supabase, companyId),
  ]);
  return buildDefectPareto(bundle.events, {
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
  const [bundle, names, photos] = await Promise.all([
    loadFinishBundle(supabase, companyId, workday, workday),
    loadNames(supabase, companyId),
    loadPhotos(supabase, companyId, workday, workday),
  ]);
  return buildWorkReport({
    workday,
    worker,
    events: bundle.events,
    photos,
    lotsById: bundle.lotsById,
    startsById: bundle.startsById,
    processNames: names.processNames,
    defectNames: names.defectNames,
    excludeTestWorkers,
  });
}
