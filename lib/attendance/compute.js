import { getWorkDateForRecord } from '../analytics.js';
import {
  addKstDays,
  formatKstISODate,
  getKstDay,
  startOfKstDay,
} from '../kst.js';
import { judgeAttendance } from './judge.js';
import {
  ensureDefaultPolicies,
  fetchActivePolicies,
  resolvePolicyForWorker,
} from './policy.js';
import { collectSignalsForWorkDate } from './signals.js';
import { isAttendanceExcludedWorker } from './shift.js';
import { buildAttendanceUpsertRow } from './upsertRow.js';

export { buildAttendanceUpsertRow };

/**
 * 활성 작업자 (removed/excluded/_test 제외)
 */
export async function fetchActiveWorkers(supabase, companyId) {
  const { data, error } = await supabase
    .from('worker_directory')
    .select(
      'worker_name, process, role, removed, excluded, display_name, phone_number, nationality, default_shift'
    )
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
  return (data || []).filter((w) => !isAttendanceExcludedWorker(w));
}

/** 최근 N일 attendance_daily.shift 맵 worker_name → ('day'|'night')[] */
export async function fetchRecentShiftsByWorker(
  supabase,
  companyId,
  beforeWorkDate,
  days = 7
) {
  const end = addKstDays(startOfKstDay(beforeWorkDate), -1);
  const start = addKstDays(end, -(days - 1));
  const startStr = formatKstISODate(start);
  const endStr = formatKstISODate(end);

  const { data, error } = await supabase
    .from('attendance_daily')
    .select('worker_name, work_date, shift')
    .eq('company_id', companyId)
    .gte('work_date', startStr)
    .lte('work_date', endStr)
    .not('shift', 'is', null);
  if (error) throw new Error(error.message);

  /** @type {Map<string, Array<'day'|'night'>>} */
  const map = new Map();
  for (const row of data || []) {
    if (row.shift !== 'day' && row.shift !== 'night') continue;
    const list = map.get(row.worker_name) || [];
    list.push(row.shift);
    map.set(row.worker_name, list);
  }
  return map;
}

/**
 * 근무일 1일분 근태 재계산 후 upsert.
 * reviewed=true 행은 신호만 갱신하고 judgment/시각/조는 관리자 값 유지.
 */
export async function computeAttendanceForWorkDate(
  supabase,
  companyId,
  workDate,
  opts = {}
) {
  await ensureDefaultPolicies(supabase, companyId);
  const policies = await fetchActivePolicies(supabase, companyId);
  const workers = await fetchActiveWorkers(supabase, companyId);
  const signalsByWorker = await collectSignalsForWorkDate(
    supabase,
    companyId,
    workDate,
    workers
  );
  const recentByWorker = await fetchRecentShiftsByWorker(
    supabase,
    companyId,
    workDate,
    7
  );

  const dayPolicyFallback = resolvePolicyForWorker(policies, null, 'day');
  const nightPolicyFallback = resolvePolicyForWorker(policies, '주조', 'night');

  const { data: existingRows, error: exErr } = await supabase
    .from('attendance_daily')
    .select('*')
    .eq('company_id', companyId)
    .eq('work_date', workDate);
  if (exErr) throw new Error(exErr.message);

  const existingByName = new Map(
    (existingRows || []).map((r) => [r.worker_name, r])
  );

  const upserts = [];
  for (const worker of workers) {
    const name = worker.worker_name;
    const signals = signalsByWorker.get(name) || [];
    const dayPolicy = resolvePolicyForWorker(policies, worker.process, 'day');
    const nightPolicy =
      resolvePolicyForWorker(policies, worker.process, 'night') ||
      nightPolicyFallback;

    const defaultShift =
      worker.default_shift === 'day' || worker.default_shift === 'night'
        ? worker.default_shift
        : null;

    const judged = judgeAttendance({
      workDate,
      signals,
      dayPolicy: dayPolicy || dayPolicyFallback,
      nightPolicy: nightPolicy || nightPolicyFallback,
      nationality: worker.nationality,
      defaultShift,
      recentShifts: recentByWorker.get(name) || [],
    });

    const prev = existingByName.get(name);
    upserts.push(
      buildAttendanceUpsertRow({
        companyId,
        workDate,
        workerName: name,
        judged,
        prev,
        overwriteReviewed: Boolean(opts.overwriteReviewed),
      })
    );
  }

  if (upserts.length) {
    const { error } = await supabase.from('attendance_daily').upsert(upserts, {
      onConflict: 'company_id,worker_name,work_date',
    });
    if (error) throw new Error(error.message);
  }

  return {
    workDate,
    workerCount: workers.length,
    presentCount: upserts.filter((u) => u.judgment === 'present').length,
    upserted: upserts.length,
  };
}

/** 전일 근무일 (지금 시각 기준) */
export function previousWorkDate(now = new Date()) {
  const todayWork = getWorkDateForRecord(now);
  return formatKstISODate(addKstDays(startOfKstDay(todayWork), -1));
}

/** 전전일 */
export function workDateDaysAgo(now = new Date(), daysAgo = 1) {
  const todayWork = getWorkDateForRecord(now);
  return formatKstISODate(addKstDays(startOfKstDay(todayWork), -daysAgo));
}

export function previousWeekRange(now = new Date()) {
  const today = startOfKstDay(now);
  const kstDay = getKstDay(today);
  const daysSinceMonday = (kstDay + 6) % 7;
  const thisMonday = addKstDays(today, -daysSinceMonday);
  const lastMonday = addKstDays(thisMonday, -7);
  const lastSunday = addKstDays(thisMonday, -1);
  return {
    start: formatKstISODate(lastMonday),
    end: formatKstISODate(lastSunday),
  };
}

export function previousMonthRange(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const prevMonth = m === 0 ? 11 : m - 1;
  const prevYear = m === 0 ? y - 1 : y;
  const start = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(prevYear, prevMonth + 1, 0)).getUTCDate();
  const end = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export async function fetchAttendanceRange(supabase, companyId, startDate, endDate) {
  const { data, error } = await supabase
    .from('attendance_daily')
    .select('*')
    .eq('company_id', companyId)
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .order('work_date', { ascending: true })
    .order('worker_name', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}
