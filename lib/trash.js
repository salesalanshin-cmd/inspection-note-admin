export const TRASH_TABLES = {
  defect: 'defect_reports',
  fives: 'fives_reports',
  doc: 'ocr_results',
};

/**
 * 요청 건수보다 적게 반영되면 실패. RLS·회사 조건으로 0건이어도
 * PostgREST는 error 없이 빈 배열을 돌려준다.
 * @param {string[]} requestedIds
 * @param {Array<{ id?: string }>|null|undefined} rows
 */
export function assertTrashAffected(requestedIds, rows) {
  const requested = Array.isArray(requestedIds) ? requestedIds.length : 0;
  const affected = Array.isArray(rows) ? rows.length : 0;
  if (affected < requested) {
    throw new Error(
      `${requested}건 중 ${affected}건만 처리됨. 권한 또는 회사 조건 때문일 수 있음`
    );
  }
  return rows || [];
}

/**
 * Supabase/PostgREST 오류를 화면용 문장으로 바꾼다.
 * deleted_at 없음(42703)은 권한 실패와 구분한다.
 */
export function formatTrashWriteError(error) {
  const code = error?.code ? String(error.code) : '';
  const raw = String(error?.message || '').trim();
  if (code === '42703' && /deleted_at/i.test(raw)) {
    return `삭제 시각(deleted_at) 컬럼이 없습니다. 마이그레이션 005 적용 여부를 확인해 주세요. (${code})`;
  }
  if (code && raw && !raw.includes(`(${code})`)) {
    return `${raw} (${code})`;
  }
  if (code && !raw) {
    return `처리에 실패했습니다. (${code})`;
  }
  return raw || '처리에 실패했습니다.';
}

async function loadTrashDb() {
  const { getCompanyId } = await import('./company');
  const { supabase } = await import('./supabase');
  return { getCompanyId, supabase };
}

export async function moveToTrash(table, ids) {
  if (!ids.length) return [];
  const { getCompanyId, supabase } = await loadTrashDb();
  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from(table)
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .in('id', ids)
    .select('id');
  if (error) throw new Error(formatTrashWriteError(error));
  return assertTrashAffected(ids, data);
}

export async function restoreFromTrash(table, ids) {
  if (!ids.length) return [];
  const { getCompanyId, supabase } = await loadTrashDb();
  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from(table)
    .update({
      is_deleted: false,
      deleted_at: null,
    })
    .eq('company_id', companyId)
    .in('id', ids)
    .select('id');
  if (error) throw new Error(formatTrashWriteError(error));
  return assertTrashAffected(ids, data);
}

/**
 * 완전삭제. .select()를 체이닝해 실제로 삭제된 row를 반환합니다.
 * RLS에 DELETE 정책이 없으면 error 없이 0건이 반환되므로(조용한 실패)
 * 호출 측에서 반환된 삭제 건수와 요청 건수를 비교해 실패를 감지해야 합니다.
 * @returns {Promise<Array>} 실제 삭제된 row 목록
 */
export async function permanentlyDelete(table, ids) {
  if (!ids.length) return [];
  const { getCompanyId, supabase } = await loadTrashDb();
  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq('company_id', companyId)
    .in('id', ids)
    .select();
  if (error) throw error;
  return data || [];
}
