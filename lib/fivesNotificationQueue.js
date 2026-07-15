import { supabase } from './supabase';

/**
 * 3정5S 영역 지적사항 → fives_notification_queue 동기화.
 *
 * 카카오 알림톡(솔라피 등) 실제 발송은 사전 준비 후 별도 작업 예정.
 * 여기서는 대기열에 쌓아 두고 status=pending 인프라만 담당한다.
 *
 * 유니크 키: (fives_report_id, marker_index)
 * - 신규: status='pending'
 * - 기존: status 유지, 나머지 필드만 갱신
 * - 영역 삭제 또는 오류코드 제거 시 해당 큐 행 삭제
 *
 * @param {{
 *   fivesReportId: string,
 *   workerName: string|null,
 *   zoneCode: string|null,
 *   markers: Array<{ code?: string, note?: string }>
 * }} params
 */
export async function syncFivesNotificationQueue({
  fivesReportId,
  workerName,
  zoneCode,
  markers,
}) {
  if (!fivesReportId) throw new Error('fivesReportId is required');

  const list = Array.isArray(markers) ? markers : [];
  const withCode = list
    .map((marker, index) => ({ marker, index }))
    .filter(({ marker }) => Boolean(marker?.code));

  const { data: existing, error: fetchError } = await supabase
    .from('fives_notification_queue')
    .select('id, marker_index, status')
    .eq('fives_report_id', fivesReportId);

  if (fetchError) throw fetchError;

  const existingByIndex = new Map((existing || []).map((row) => [row.marker_index, row]));
  const keepIndices = new Set(withCode.map((item) => item.index));

  const toDeleteIds = (existing || [])
    .filter((row) => !keepIndices.has(row.marker_index))
    .map((row) => row.id);

  if (toDeleteIds.length) {
    const { error: delError } = await supabase
      .from('fives_notification_queue')
      .delete()
      .in('id', toDeleteIds);
    if (delError) throw delError;
  }

  for (const { marker, index } of withCode) {
    const prev = existingByIndex.get(index);
    const payload = {
      worker_name: workerName || null,
      sos_error_code: marker.code,
      sos_error_note: marker.note || null,
      zone_code: zoneCode || null,
    };

    if (prev) {
      // 기존 항목: status는 유지하고 code/note·작업자·구역만 갱신
      const { error: updError } = await supabase
        .from('fives_notification_queue')
        .update(payload)
        .eq('id', prev.id);
      if (updError) throw updError;
    } else {
      const { error: insError } = await supabase.from('fives_notification_queue').insert({
        fives_report_id: fivesReportId,
        marker_index: index,
        status: 'pending',
        ...payload,
      });
      if (insError) throw insError;
    }
  }
}

/** 발송 대기(status=pending) 건수 — 알림톡 발송 UI는 추후 별도 구현 */
export async function countPendingFivesNotifications() {
  const { count, error } = await supabase
    .from('fives_notification_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) throw error;
  return count || 0;
}
