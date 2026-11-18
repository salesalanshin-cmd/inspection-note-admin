import { formatKstISODate, kstWallToUtc } from '../kst.js';
import { fetchActivePolicies, resolvePolicyForWorker } from './policy.js';
import { fetchAllPages } from './pagedQuery.js';
import { buildAttendanceCard, monthBounds } from './card.js';

const NOT_DELETED = 'is_deleted.eq.false,is_deleted.is.null';
const MONTH = /^\d{4}-\d{2}$/;

/** 카드 표시·집계에 쓰는 attendance_daily 컬럼만 */
const ATTENDANCE_CARD_COLUMNS = [
  'id',
  'worker_name',
  'work_date',
  'shift',
  'judgment',
  'estimated_clock_in',
  'estimated_clock_out',
  'is_ot',
  'confidence',
  'reviewed',
  'signal_kinds',
].join(',');

function shiftTimesOf(policy) {
  return {
    start: String(policy?.work_start_time || '').trim(),
    end: String(policy?.work_end_time || '').trim(),
  };
}

/** 근무일 08:00 경계가 월 안에 들어오도록, 당월 0시부터 다음달 08:00 직전까지. */
export function inspectionQueryRange(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = kstWallToUtc(year, monthNumber - 1, 1, 0, 0, 0, 0);
  const end = kstWallToUtc(year, monthNumber, 1, 8, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function readPages(buildQuery, timeColumn, label) {
  const result = await fetchAllPages(buildQuery, { timeColumn, label });
  if (result.error) throw new Error(result.error.message || `${label} 조회 실패`);
  if (result.truncated) {
    throw new Error(`${label} 조회가 페이지 상한에 도달했습니다.`);
  }
  return result.rows;
}

async function timed(label, fn, timings) {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    timings[label] = Date.now() - started;
  }
}

/**
 * 한 회사·한 작업자·한 달. 판정을 다시 계산하지 않고 저장된 행과 촬영만 읽는다.
 * @returns {Promise<{ card: object|null, timings: Record<string, number> }>}
 */
export async function loadAttendanceCard(supabase, companyId, { name, month, today } = {}) {
  const workerName = String(name || '').trim();
  const monthKey = String(month || '').trim();
  if (!workerName) throw new Error('작업자 이름이 필요합니다.');
  if (!MONTH.test(monthKey)) throw new Error('month 는 YYYY-MM 이어야 합니다.');
  if (!companyId) throw new Error('company_id 가 필요합니다.');

  const bounds = monthBounds(monthKey);
  const todayKey = today || formatKstISODate(new Date());
  const range = inspectionQueryRange(monthKey);
  const timings = {};

  const sourceFilter = (table) => () =>
    supabase
      .from(table)
      .select(
        table === 'defect_reports'
          ? 'id, worker_name, created_at, defect_type, defect_code'
          : 'id, worker_name, created_at'
      )
      .eq('company_id', companyId)
      .eq('worker_name', workerName)
      .or(NOT_DELETED)
      .gte('created_at', range.start)
      .lt('created_at', range.end);

  const loadStarted = Date.now();
  const [
    directoryResult,
    attendanceRows,
    latestResult,
    policies,
    goods,
    defects,
    fives,
  ] = await Promise.all([
    timed(
      'directory',
      async () => {
        const { data, error } = await supabase
          .from('worker_directory')
          .select('worker_name, display_name, default_shift, process, removed, excluded')
          .eq('company_id', companyId)
          .eq('worker_name', workerName)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      },
      timings
    ),
    timed(
      'attendance',
      () =>
        readPages(
          () =>
            supabase
              .from('attendance_daily')
              .select(ATTENDANCE_CARD_COLUMNS)
              .eq('company_id', companyId)
              .eq('worker_name', workerName)
              .gte('work_date', bounds.start)
              .lte('work_date', bounds.end),
          'work_date',
          'attendance_daily'
        ),
      timings
    ),
    timed(
      'latest',
      async () => {
        const { data, error } = await supabase
          .from('attendance_daily')
          .select('work_date')
          .eq('company_id', companyId)
          .order('work_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      },
      timings
    ),
    timed('policies', () => fetchActivePolicies(supabase, companyId), timings),
    timed(
      'goods',
      () => readPages(sourceFilter('good_reports'), 'created_at', 'good_reports'),
      timings
    ),
    timed(
      'defects',
      () => readPages(sourceFilter('defect_reports'), 'created_at', 'defect_reports'),
      timings
    ),
    timed(
      'fives',
      () => readPages(sourceFilter('fives_reports'), 'created_at', 'fives_reports'),
      timings
    ),
  ]);
  timings.load = Date.now() - loadStarted;

  const directory = directoryResult;
  if (!directory && attendanceRows.length === 0) {
    return { card: null, timings };
  }

  const process = directory?.process || null;
  const dayPolicy = resolvePolicyForWorker(policies, process, 'day');
  const nightPolicy = resolvePolicyForWorker(policies, process, 'night');

  const buildStarted = Date.now();
  const card = buildAttendanceCard({
    worker: directory || { worker_name: workerName },
    month: monthKey,
    today: todayKey,
    coveredTo: latestResult?.work_date || null,
    attendanceRows,
    shiftTimes: {
      day: shiftTimesOf(dayPolicy),
      night: shiftTimesOf(nightPolicy),
    },
    goods,
    defects,
    fives,
  });
  timings.build = Date.now() - buildStarted;

  return { card, timings };
}
