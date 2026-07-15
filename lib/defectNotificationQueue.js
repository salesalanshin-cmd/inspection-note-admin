import { supabase } from './supabase';
import { DEFECT_CODE_LABELS } from './constants';

/**
 * 불량기록 영역 지적사항 → defect_notification_queue 동기화.
 *
 * 카카오 알림톡(솔라피 등) 실제 발송은 사전 준비 후 별도 작업 예정.
 * 여기서는 대기열에 쌓아 두고 status=pending 인프라만 담당한다.
 *
 * 유니크 키: (defect_report_id, marker_index)
 * - 신규: status='pending'
 * - 기존: status 유지, 나머지 필드만 갱신
 * - 영역 삭제 또는 오류코드 제거 시 해당 큐 행 삭제
 *
 * @param {{
 *   defectReportId: string,
 *   workerName: string|null,
 *   markers: Array<{ code?: string }>,
 *   reportDefectCode?: string|null,
 *   reportDefectType?: string|null,
 * }} params
 */
export async function syncDefectNotificationQueue({
  defectReportId,
  workerName,
  markers,
  reportDefectCode,
  reportDefectType,
}) {
  if (!defectReportId) throw new Error('defectReportId is required');

  const list = Array.isArray(markers) ? markers : [];
  const withCode = list
    .map((marker, index) => {
      const code = marker?.code || reportDefectCode || null;
      if (!code) return null;
      const type = DEFECT_CODE_LABELS[code] || reportDefectType || null;
      return { index, code, type };
    })
    .filter(Boolean);

  const { data: existing, error: fetchError } = await supabase
    .from('defect_notification_queue')
    .select('id, marker_index, status')
    .eq('defect_report_id', defectReportId);

  if (fetchError) throw fetchError;

  const existingByIndex = new Map((existing || []).map((row) => [row.marker_index, row]));
  const keepIndices = new Set(withCode.map((item) => item.index));

  const toDeleteIds = (existing || [])
    .filter((row) => !keepIndices.has(row.marker_index))
    .map((row) => row.id);

  if (toDeleteIds.length) {
    const { error: delError } = await supabase
      .from('defect_notification_queue')
      .delete()
      .in('id', toDeleteIds);
    if (delError) throw delError;
  }

  for (const { index, code, type } of withCode) {
    const prev = existingByIndex.get(index);
    const payload = {
      worker_name: workerName || null,
      defect_code: code,
      defect_type: type,
    };

    if (prev) {
      const { error: updError } = await supabase
        .from('defect_notification_queue')
        .update(payload)
        .eq('id', prev.id);
      if (updError) throw updError;
    } else {
      const { error: insError } = await supabase.from('defect_notification_queue').insert({
        defect_report_id: defectReportId,
        marker_index: index,
        status: 'pending',
        ...payload,
      });
      if (insError) throw insError;
    }
  }
}

/** 발송 대기(status=pending) 건수 — 알림톡 발송 UI는 추후 별도 구현 */
export async function countPendingDefectNotifications() {
  const { count, error } = await supabase
    .from('defect_notification_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) throw error;
  return count || 0;
}
