/**
 * 근태 정책 로드·매칭.
 * shift=day|night, window_* = 신호 소속 구간, work_* = 추정 출퇴근.
 */

export const ATTENDANCE_DEFAULT_POLICIES = [
  {
    target_type: 'process',
    target_value: '주조',
    shift: 'day',
    work_start_time: '08:00',
    work_end_time: '20:00',
    ot_threshold_time: '18:00',
    ot_end_time: '20:00',
    adjust_minutes: 30,
    window_start_time: '07:00',
    window_end_time: '20:30',
    signal_merge_minutes: 10,
    clock_out_min_gap_minutes: 60,
  },
  {
    target_type: 'process',
    target_value: '주조',
    shift: 'night',
    work_start_time: '20:00',
    work_end_time: '08:00',
    ot_threshold_time: '06:00',
    ot_end_time: '08:00',
    adjust_minutes: 30,
    window_start_time: '19:00',
    window_end_time: '09:00',
    signal_merge_minutes: 10,
    clock_out_min_gap_minutes: 60,
  },
  {
    target_type: 'process',
    target_value: '사상',
    shift: 'day',
    work_start_time: '08:00',
    work_end_time: '17:00',
    ot_threshold_time: '18:00',
    ot_end_time: '20:00',
    adjust_minutes: 0,
    window_start_time: '07:00',
    window_end_time: '20:30',
    signal_merge_minutes: 10,
    clock_out_min_gap_minutes: 60,
  },
  {
    target_type: 'process',
    target_value: '검사',
    shift: 'day',
    work_start_time: '08:00',
    work_end_time: '17:00',
    ot_threshold_time: '18:00',
    ot_end_time: '20:00',
    adjust_minutes: 0,
    window_start_time: '07:00',
    window_end_time: '20:30',
    signal_merge_minutes: 10,
    clock_out_min_gap_minutes: 60,
  },
  {
    target_type: 'default',
    target_value: null,
    shift: 'day',
    work_start_time: '08:00',
    work_end_time: '17:00',
    ot_threshold_time: '18:00',
    ot_end_time: '20:00',
    adjust_minutes: 0,
    window_start_time: '07:00',
    window_end_time: '20:30',
    signal_merge_minutes: 10,
    clock_out_min_gap_minutes: 60,
  },
  {
    target_type: 'default',
    target_value: null,
    shift: 'night',
    work_start_time: '20:00',
    work_end_time: '08:00',
    ot_threshold_time: '06:00',
    ot_end_time: '08:00',
    adjust_minutes: 30,
    window_start_time: '19:00',
    window_end_time: '09:00',
    signal_merge_minutes: 10,
    clock_out_min_gap_minutes: 60,
  },
];

/** 신호 조회 패딩 (정책 window 바깥 여유). 단일 정의. */
export const ATTENDANCE_SIGNAL_QUERY = {
  fromOffsetDays: -1,
  fromHm: '17:00',
  toOffsetDays: 1,
  toHm: '09:00',
};

export function policyShift(p) {
  return p?.shift === 'night' ? 'night' : 'day';
}

export function policyWindowStart(p) {
  if (p?.window_start_time) return String(p.window_start_time).trim();
  return policyShift(p) === 'night' ? '19:00' : '07:00';
}

export function policyWindowEnd(p) {
  if (p?.window_end_time) return String(p.window_end_time).trim();
  return policyShift(p) === 'night' ? '09:00' : '20:30';
}

/**
 * company에 정책이 없으면 시드. 누락 shift/window 행만 보강.
 */
export async function ensureDefaultPolicies(supabase, companyId) {
  const { data: existing, error } = await supabase
    .from('attendance_policy')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (error) throw new Error(error.message);
  const rows = existing || [];

  if (rows.length === 0) {
    const seed = ATTENDANCE_DEFAULT_POLICIES.map((p) => ({
      company_id: companyId,
      ...p,
      is_active: true,
    }));
    const { error: insErr } = await supabase.from('attendance_policy').insert(seed);
    if (insErr) throw new Error(insErr.message);
    return { seeded: true, count: seed.length };
  }

  const key = (p) =>
    `${p.target_type}|${p.target_value ?? ''}|${policyShift(p)}`;
  const have = new Set(rows.map(key));
  const missing = ATTENDANCE_DEFAULT_POLICIES.filter((p) => !have.has(key(p))).map(
    (p) => ({
      company_id: companyId,
      ...p,
      is_active: true,
    })
  );

  if (missing.length) {
    const { error: insErr } = await supabase.from('attendance_policy').insert(missing);
    if (insErr) throw new Error(insErr.message);
  }

  // window_* 비어 있으면 기본값 채움
  for (const row of rows) {
    if (row.window_start_time && row.window_end_time) continue;
    const fb = ATTENDANCE_DEFAULT_POLICIES.find(
      (p) =>
        p.target_type === row.target_type &&
        (p.target_value ?? null) === (row.target_value ?? null) &&
        policyShift(p) === policyShift(row)
    );
    if (!fb) continue;
    await supabase
      .from('attendance_policy')
      .update({
        window_start_time: row.window_start_time || fb.window_start_time,
        window_end_time: row.window_end_time || fb.window_end_time,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
  }

  return { seeded: false, count: rows.length, added: missing.length };
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
 * process+shift → default+shift → 주조+shift(야간 폴백) → process+day → default+day → 코드 fallback
 * 비주조에 야간 정책이 없으면 주조 야간 정책을 사용(테이블에 공정별 추가 가능).
 */
export function resolvePolicyForWorker(policies, workerProcess, shift = 'day') {
  const list = policies || [];
  const process = workerProcess ? String(workerProcess).trim() : '';
  const want = shift === 'night' ? 'night' : 'day';

  const find = (type, value, sh) =>
    list.find(
      (p) =>
        p.target_type === type &&
        (value == null
          ? p.target_value == null || p.target_value === ''
          : p.target_value === value) &&
        policyShift(p) === sh
    );

  if (process) {
    const hit = find('process', process, want);
    if (hit) return hit;
  }

  // 비주조에 야간 행이 없으면 주조 야간을 우선 (공정별 추가 가능)
  if (want === 'night' && process && process !== '주조') {
    const castingNight = find('process', '주조', 'night');
    if (castingNight) return castingNight;
  }

  const defShift = find('default', null, want);
  if (defShift) return defShift;

  if (process) {
    const dayHit = find('process', process, 'day');
    if (dayHit && want === 'day') return dayHit;
  }
  const defDay = find('default', null, 'day');
  if (defDay && want === 'day') return defDay;

  const fallback =
    ATTENDANCE_DEFAULT_POLICIES.find(
      (p) =>
        p.target_type === 'process' &&
        p.target_value === process &&
        policyShift(p) === want
    ) ||
    (want === 'night'
      ? ATTENDANCE_DEFAULT_POLICIES.find(
          (p) =>
            p.target_type === 'process' &&
            p.target_value === '주조' &&
            policyShift(p) === 'night'
        )
      : null) ||
    ATTENDANCE_DEFAULT_POLICIES.find(
      (p) => p.target_type === 'default' && policyShift(p) === want
    ) ||
    ATTENDANCE_DEFAULT_POLICIES.find((p) => p.target_type === 'default');

  return fallback;
}
