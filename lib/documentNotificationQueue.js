import { supabase } from './supabase';

/**
 * 문서 영역 지적사항 → document_notification_queue 동기화.
 *
 * 카카오 알림톡(솔라피 등) 실제 발송은 사전 준비 후 별도 작업 예정.
 * 여기서는 대기열에 쌓아 두고 status=pending 인프라만 담당한다.
 *
 * @param {{
 *   ocrResultId: string,
 *   workerName: string|null,
 *   markers: Array<{ code?: string, note?: string }>
 * }} params
 */
export async function syncDocumentNotificationQueue({ ocrResultId, workerName, markers }) {
  if (!ocrResultId) throw new Error('ocrResultId is required');

  const list = Array.isArray(markers) ? markers : [];
  const withCode = list
    .map((marker, index) => ({ marker, index }))
    .filter(({ marker }) => Boolean(marker?.code));

  const { data: existing, error: fetchError } = await supabase
    .from('document_notification_queue')
    .select('id, marker_index, status')
    .eq('ocr_result_id', ocrResultId);

  if (fetchError) throw fetchError;

  const existingByIndex = new Map((existing || []).map((row) => [row.marker_index, row]));
  const keepIndices = new Set(withCode.map((item) => item.index));

  const toDeleteIds = (existing || [])
    .filter((row) => !keepIndices.has(row.marker_index))
    .map((row) => row.id);

  if (toDeleteIds.length) {
    const { error: delError } = await supabase
      .from('document_notification_queue')
      .delete()
      .in('id', toDeleteIds);
    if (delError) throw delError;
  }

  for (const { marker, index } of withCode) {
    const prev = existingByIndex.get(index);
    const payload = {
      worker_name: workerName || null,
      doc_error_code: marker.code,
      doc_error_note: marker.note || null,
    };

    if (prev) {
      // 기존 항목: status는 유지하고 code/note·작업자만 갱신
      const { error: updError } = await supabase
        .from('document_notification_queue')
        .update(payload)
        .eq('id', prev.id);
      if (updError) throw updError;
    } else {
      const { error: insError } = await supabase.from('document_notification_queue').insert({
        ocr_result_id: ocrResultId,
        marker_index: index,
        status: 'pending',
        ...payload,
      });
      if (insError) throw insError;
    }
  }
}

/** 발송 대기(status=pending) 건수 */
export async function countPendingDocumentNotifications() {
  const { count, error } = await supabase
    .from('document_notification_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) throw error;
  return count || 0;
}
