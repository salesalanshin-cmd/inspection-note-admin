import { supabase } from './supabase';

export const TRASH_TABLES = {
  defect: 'defect_reports',
  fives: 'fives_reports',
  doc: 'ocr_results',
};

export async function moveToTrash(table, ids) {
  if (!ids.length) return;
  const { error } = await supabase
    .from(table)
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .in('id', ids);
  if (error) throw error;
}

export async function restoreFromTrash(table, ids) {
  if (!ids.length) return;
  const { error } = await supabase
    .from(table)
    .update({
      is_deleted: false,
      deleted_at: null,
    })
    .in('id', ids);
  if (error) throw error;
}

/**
 * 완전삭제. .select()를 체이닝해 실제로 삭제된 row를 반환합니다.
 * RLS에 DELETE 정책이 없으면 error 없이 0건이 반환되므로(조용한 실패)
 * 호출 측에서 반환된 삭제 건수와 요청 건수를 비교해 실패를 감지해야 합니다.
 * @returns {Promise<Array>} 실제 삭제된 row 목록
 */
export async function permanentlyDelete(table, ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase.from(table).delete().in('id', ids).select();
  if (error) throw error;
  return data || [];
}
