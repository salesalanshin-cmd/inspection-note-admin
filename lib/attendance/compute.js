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

/**
 * 활성 작업자 디렉터리 (removed/excluded 제외)
 */
export async function fetchActiveWorkers(supabase, companyId) {
  const { data, error } = await supabase
    .from('worker_directory')
    .select('worker_name, process, role, removed, excluded, display_name, phone_number')
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
  return (data || []).filter(
    (w) => w.worker_name && w.removed !== true && w.excluded !== true
  );
}

/**
 * 근무일 1일분 근태 재계산 후 upsert.
 * reviewed=true 행은 신호·추정만 갱신하고 judgment/시각은 관리자 값 유지 옵션.
 *
 * @param {{ overwriteReviewed?: boolean }} [opts]
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
    workDate
  );

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
    const policy = resolvePolicyForWorker(policies, worker.process);
    const signals = signalsByWorker.get(name) || [];
    const judged = judgeAttendance({ workDate, signals, policy });
    const prev = existingByName.get(name);

    if (prev?.reviewed && !opts.overwriteReviewed) {
      upserts.push({
        company_id: companyId,
        worker_name: name,
        work_date: workDate,
        first_signal_at: judged.firstSignalAt,
        last_signal_at: judged.lastSignalAt,
        signal_kinds: judged.signalKinds,
        // 판정·추정·OT·reviewed 유지
        judgment: prev.judgment,
        estimated_clock_in: prev.estimated_clock_in,
        estimated_clock_out: prev.estimated_clock_out,
        is_ot: prev.is_ot,
        confidence: judged.confidence,
        reviewed: true,
        reviewed_by: prev.reviewed_by,
        reviewed_at: prev.reviewed_at,
        notes: prev.notes,
        updated_at: new Date().toISOString(),
      });
    } else {
      upserts.push({
        company_id: companyId,
        worker_name: name,
        work_date: workDate,
        first_signal_at: judged.firstSignalAt,
        last_signal_at: judged.lastSignalAt,
        signal_kinds: judged.signalKinds,
        judgment: judged.judgment,
        estimated_clock_in: judged.estimatedClockIn,
        estimated_clock_out: judged.estimatedClockOut,
        is_ot: judged.isOt,
        confidence: judged.confidence,
        reviewed: false,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: new Date().toISOString(),
      });
    }
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

/** 전주 월~일 (KST), 월요일 오전에 호출 가정 */
export function previousWeekRange(now = new Date()) {
  const today = startOfKstDay(now);
  const kstDay = getKstDay(today); // 0=일 … 6=토
  const daysSinceMonday = (kstDay + 6) % 7; // Mon=0 … Sun=6
  const thisMonday = addKstDays(today, -daysSinceMonday);
  const lastMonday = addKstDays(thisMonday, -7);
  const lastSunday = addKstDays(thisMonday, -1);
  return {
    start: formatKstISODate(lastMonday),
    end: formatKstISODate(lastSunday),
  };
}

/** 전월 1일~말일 */
export function previousMonthRange(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth(); // 0-11 current
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
