import { getWorkDateForRecord, getWorkRangeBounds } from '../analytics.js';
import { sendAlimtalk, isAlimtalkEnabled } from '../solapiClient.js';
import { fetchActiveWorkers } from './compute.js';

export const ATTENDANCE_FIVES_NUDGE_KEY = 'attendance_fives_nudge';

/**
 * automation_settings 에서 근태 3정5S 독촉 스위치 (기본 OFF)
 */
export async function isFivesNudgeEnabled(supabase, companyId) {
  const { data, error } = await supabase
    .from('automation_settings')
    .select('enabled')
    .eq('company_id', companyId)
    .eq('key', ATTENDANCE_FIVES_NUDGE_KEY)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[attendance/nudge] settings', error.message);
    return false;
  }
  return data?.enabled === true;
}

/**
 * 오늘 근무일 기준 3정5S 기록이 없는 활성 작업자 → 본인 알림톡 (템플릿 fives)
 * 담당자 = 작업자 본인 전화번호. 관리자 일괄은 추후 확장.
 */
export async function runFivesMissingNudge(supabase, companyId, now = new Date()) {
  if (!(await isFivesNudgeEnabled(supabase, companyId))) {
    return { ok: true, skipped: true, reason: 'nudge_disabled' };
  }
  if (!isAlimtalkEnabled()) {
    return { ok: true, skipped: true, reason: 'alimtalk_not_configured' };
  }

  const workDate = getWorkDateForRecord(now);
  const { start, end } = getWorkRangeBounds(workDate);
  const workers = await fetchActiveWorkers(supabase, companyId);

  const { data: fives, error } = await supabase
    .from('fives_reports')
    .select('worker_name')
    .eq('company_id', companyId)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString());
  if (error) throw new Error(error.message);

  const hasFives = new Set(
    (fives || []).map((r) => r.worker_name).filter(Boolean)
  );

  const missing = workers.filter((w) => !hasFives.has(w.worker_name));
  const sent = [];
  const failed = [];

  for (const w of missing) {
    const phone = String(w.phone_number || '').replace(/\D/g, '');
    if (!phone) {
      failed.push({ worker: w.worker_name, error: 'no_phone' });
      continue;
    }
    const result = await sendAlimtalk({
      to: phone,
      templateType: 'fives',
      variables: {
        작업자명: w.display_name || w.worker_name,
      },
    });
    if (result?.success) {
      sent.push({ worker: w.worker_name, messageId: result.messageId || null });
    } else {
      failed.push({
        worker: w.worker_name,
        error: result?.error || 'send_failed',
      });
    }
  }

  return {
    ok: true,
    workDate,
    missingCount: missing.length,
    sent: sent.length,
    failed,
  };
}
