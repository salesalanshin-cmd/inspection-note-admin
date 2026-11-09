/**
 * 근태 관리자 API용 허용 필드·입력 검증 (순수 함수).
 * company_id 는 서버 getCompanyId() 만 신뢰한다.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** attendance_daily UPDATE 에 허용하는 컬럼 */
export const ATTENDANCE_DAILY_PATCH_FIELDS = Object.freeze([
  'shift',
  'judgment',
  'estimated_clock_in',
  'estimated_clock_out',
  'is_ot',
  'reviewed',
  'reviewed_at',
  'reviewed_by',
  'confidence',
  'flags',
  'judgment_rationale',
  'admin_comment',
  'updated_at',
]);

/** 조회 select 화이트리스트 (* 허용) */
export const ATTENDANCE_DAILY_SELECT_FIELDS = Object.freeze([
  'id',
  'company_id',
  'worker_name',
  'work_date',
  'shift',
  'judgment',
  'estimated_clock_in',
  'estimated_clock_out',
  'is_ot',
  'reviewed',
  'reviewed_at',
  'reviewed_by',
  'confidence',
  'flags',
  'judgment_rationale',
  'admin_comment',
  'first_signal_at',
  'last_signal_at',
  'signal_kinds',
  'created_at',
  'updated_at',
]);

export const ATTENDANCE_EDIT_LOG_INSERT_FIELDS = Object.freeze([
  'company_id',
  'attendance_id',
  'worker_name',
  'work_date',
  'field',
  'old_value',
  'new_value',
  'source',
  'original_rule',
  'edited_by',
  'edited_at',
  'batch_id',
]);

const PATCH_SET = new Set(ATTENDANCE_DAILY_PATCH_FIELDS);
const SELECT_SET = new Set(ATTENDANCE_DAILY_SELECT_FIELDS);
const LOG_SET = new Set(ATTENDANCE_EDIT_LOG_INSERT_FIELDS);

export function isYmd(value) {
  return YMD.test(String(value || '').trim());
}

/**
 * 클라이언트가 보낸 company_id 는 무시하고 서버 companyId 만 쓴다.
 * @returns {{ ok: true, patch: object } | { ok: false, error: string }}
 */
export function pickAttendanceDailyPatch(input, serverCompanyId) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'patch 가 필요합니다.' };
  }
  if ('company_id' in input && input.company_id != null) {
    if (String(input.company_id) !== String(serverCompanyId)) {
      return { ok: false, error: 'company_id 는 서버에서만 정합니다.' };
    }
  }
  const patch = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'company_id' || key === 'id') continue;
    if (!PATCH_SET.has(key)) {
      return { ok: false, error: `허용되지 않은 필드: ${key}` };
    }
    patch[key] = value;
  }
  if (!Object.keys(patch).length) {
    return { ok: false, error: '변경할 필드가 없습니다.' };
  }
  return { ok: true, patch };
}

/** select 문자열 검증. '*' 또는 화이트리스트 쉼표 목록. */
export function resolveAttendanceSelect(raw) {
  const text = String(raw || '*').trim();
  if (!text || text === '*') return '*';
  const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return '*';
  for (const part of parts) {
    if (!SELECT_SET.has(part)) {
      return { error: `허용되지 않은 select 필드: ${part}` };
    }
  }
  return parts.join(', ');
}

/**
 * edit_log 행 배열. company_id 는 서버 값으로 덮어쓴다.
 */
export function sanitizeEditLogRows(rows, serverCompanyId) {
  if (!Array.isArray(rows) || !rows.length) {
    return { ok: false, error: 'logs 배열이 필요합니다.' };
  }
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      return { ok: false, error: '로그 행 형식이 올바르지 않습니다.' };
    }
    if (row.company_id != null && String(row.company_id) !== String(serverCompanyId)) {
      return { ok: false, error: 'company_id 는 서버에서만 정합니다.' };
    }
    const next = { company_id: serverCompanyId };
    for (const [key, value] of Object.entries(row)) {
      if (key === 'company_id' || key === 'id') continue;
      if (!LOG_SET.has(key)) {
        return { ok: false, error: `허용되지 않은 로그 필드: ${key}` };
      }
      next[key] = value;
    }
    if (!next.attendance_id || !next.work_date || !next.field) {
      return { ok: false, error: 'attendance_id, work_date, field 가 필요합니다.' };
    }
    out.push(next);
  }
  return { ok: true, rows: out };
}

export function parseIdList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id).trim()).filter(Boolean);
  }
  return String(raw || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}
