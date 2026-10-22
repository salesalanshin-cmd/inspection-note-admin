/**
 * 근태 정책 로드·매칭.
 * DB attendance_policy 기준. 시드 기본값은 ensureDefaultPolicies 참고.
 */

export const ATTENDANCE_DEFAULT_POLICIES = [
  {
    target_type: 'process',
    target_value: '주조',
    work_start_time: '08:00',
    work_end_time: '20:00',
    ot_threshold_time: '18:00',
    ot_end_time: '20:00',
    adjust_minutes: 0,
  },
  {
    target_type: 'process',
    target_value: '사상',
    work_start_time: '08:00',
    work_end_time: '17:00',
    ot_threshold_time: '18:00',
    ot_end_time: '20:00',
    adjust_minutes: 0,
  },
  {
    target_type: 'process',
    target_value: '검사',
    work_start_time: '08:00',
    work_end_time: '17:00',
    ot_threshold_time: '18:00',
    ot_end_time: '20:00',
    adjust_minutes: 0,
  },
  {
    target_type: 'default',
    target_value: null,
    work_start_time: '08:00',
    work_end_time: '17:00',
    ot_threshold_time: '18:00',
    ot_end_time: '20:00',
    adjust_minutes: 0,
  },
];

/**
 * company에 정책이 없으면 시드 삽입
 */
export async function ensureDefaultPolicies(supabase, companyId) {
  const { count, error } = await supabase
    .from('attendance_policy')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (error) throw new Error(error.message);
  if ((count || 0) > 0) return { seeded: false, count };

  const rows = ATTENDANCE_DEFAULT_POLICIES.map((p) => ({
    company_id: companyId,
    ...p,
    is_active: true,
  }));

  const { error: insErr } = await supabase.from('attendance_policy').insert(rows);
  if (insErr) throw new Error(insErr.message);
  return { seeded: true, count: rows.length };
}

export async function fetchActivePolicies(supabase, companyId) {
  const { data, error } = await supabase
    .from('attendance_policy')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * 작업자 process에 맞는 정책. 없으면 default, 그것도 없으면 ATTENDANCE_DEFAULT_POLICIES fallback
 */
export function resolvePolicyForWorker(policies, workerProcess) {
  const list = policies || [];
  const process = workerProcess ? String(workerProcess).trim() : '';

  if (process) {
    const hit = list.find(
      (p) => p.target_type === 'process' && p.target_value === process
    );
    if (hit) return hit;
  }

  const def = list.find((p) => p.target_type === 'default');
  if (def) return def;

  const fallback =
    ATTENDANCE_DEFAULT_POLICIES.find(
      (p) => p.target_type === 'process' && p.target_value === process
    ) || ATTENDANCE_DEFAULT_POLICIES.find((p) => p.target_type === 'default');

  return fallback;
}
