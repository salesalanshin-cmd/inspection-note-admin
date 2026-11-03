import {
  MISDIAGNOSIS_ALERT_THRESHOLD,
  MISDIAGNOSIS_ALERT_WINDOW_DAYS,
  getCodeLabel,
} from './constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function text(value) {
  if (value == null) return '';
  return String(value).trim();
}

export function misdiagnosisGroupKey(row) {
  return [
    text(row?.company_id),
    text(row?.code_set),
    text(row?.product_name),
    text(row?.ai_suggested_code),
    text(row?.final_code),
  ].join('\0');
}

/**
 * 알림 집계에 넣을 정정 한 건인지.
 * 수락, 제품명 없음, 코드가 같거나 비어 있음, 윈도우 밖은 제외.
 */
export function isAlertableMisdiagnosis(row, { now = new Date(), windowDays = MISDIAGNOSIS_ALERT_WINDOW_DAYS } = {}) {
  if (row?.was_ai_accepted !== false) return false;
  const productName = text(row?.product_name);
  const aiCode = text(row?.ai_suggested_code);
  const finalCode = text(row?.final_code);
  const codeSet = text(row?.code_set);
  const companyId = text(row?.company_id);
  if (!companyId || !codeSet || !productName || !aiCode || !finalCode) return false;
  if (aiCode === finalCode) return false;

  const created = new Date(row?.created_at).getTime();
  if (Number.isNaN(created)) return false;
  const cutoff = now.getTime() - windowDays * DAY_MS;
  return created >= cutoff;
}

/**
 * 건수가 임계값 이상이고, 마지막 알림 이후 임계값만큼 더 쌓였으면 발송.
 * lastNotifiedCount가 없으면 0으로 본다. 3 미만은 항상 발송하지 않는다.
 */
export function shouldNotifyMisdiagnosis(
  count,
  lastNotifiedCount,
  threshold = MISDIAGNOSIS_ALERT_THRESHOLD
) {
  const total = Number(count) || 0;
  const last = Number(lastNotifiedCount) || 0;
  const step = Number(threshold) || 0;
  if (step <= 0) return false;
  if (total < step) return false;
  return total >= last + step;
}

/**
 * 정정 로그와 기존 알림 상태를 묶어 발송 여부를 정한다.
 * @returns {Array<{ company_id, code_set, product_name, ai_suggested_code, final_code, count, last_notified_count, notify }>}
 */
export function planMisdiagnosisAlerts(rows, alerts, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const windowDays = options.windowDays ?? MISDIAGNOSIS_ALERT_WINDOW_DAYS;
  const threshold = options.threshold ?? MISDIAGNOSIS_ALERT_THRESHOLD;
  const counts = new Map();

  for (const row of rows || []) {
    if (!isAlertableMisdiagnosis(row, { now, windowDays })) continue;
    const key = misdiagnosisGroupKey(row);
    const current = counts.get(key) || {
      company_id: text(row.company_id),
      code_set: text(row.code_set),
      product_name: text(row.product_name),
      ai_suggested_code: text(row.ai_suggested_code),
      final_code: text(row.final_code),
      count: 0,
    };
    current.count += 1;
    counts.set(key, current);
  }

  const alertByKey = new Map(
    (alerts || []).map((alert) => [misdiagnosisGroupKey(alert), alert])
  );

  return [...counts.values()].map((group) => {
    const alert = alertByKey.get(misdiagnosisGroupKey(group));
    const lastNotifiedCount = Number(alert?.last_notified_count) || 0;
    return {
      ...group,
      last_notified_count: lastNotifiedCount,
      notify: shouldNotifyMisdiagnosis(group.count, lastNotifiedCount, threshold),
    };
  });
}

export function formatMisdiagnosisAlertBody(group, windowDays = MISDIAGNOSIS_ALERT_WINDOW_DAYS) {
  const aiLabel = getCodeLabel(group.code_set, group.ai_suggested_code) || group.ai_suggested_code;
  const finalLabel = getCodeLabel(group.code_set, group.final_code) || group.final_code;
  return `반복 오진: ${group.product_name} AI ${aiLabel} → 사용자 ${finalLabel} 정정 ${group.count}회 (최근 ${windowDays}일)`;
}
