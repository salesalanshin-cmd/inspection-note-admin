import { supabase } from './supabase.js';
import { createServiceRoleClient } from './supabaseAdmin.js';
import { listManagerWorkerNames, sendPush } from './pushSend.js';
import {
  MISDIAGNOSIS_ALERT_THRESHOLD,
  MISDIAGNOSIS_ALERT_WINDOW_DAYS,
} from './constants.js';
import {
  formatMisdiagnosisAlertBody,
  planMisdiagnosisAlerts,
} from './misdiagnosisAlerts.js';

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

/**
 * 반복 오진 푸시. 서비스 롤로 정정 로그를 집계하고, 성공한 묶음만 알림 상태를 갱신한다.
 * 푸시 실패·수신 토큰 없음은 이 함수 안에서 삼키고 alerts를 갱신하지 않는다.
 */
export async function processMisdiagnosisAlerts({
  companyId,
  now = new Date(),
  supabaseAdmin,
} = {}) {
  if (!companyId) throw new Error('companyId가 필요합니다.');

  const admin = supabaseAdmin || createServiceRoleClient();
  const since = new Date(
    now.getTime() - MISDIAGNOSIS_ALERT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const logs = await fetchCorrectionPage(admin, companyId, since);
  const alerts = await fetchAlertPage(admin, companyId);
  const plans = planMisdiagnosisAlerts(logs.rows, alerts, {
    now,
    windowDays: MISDIAGNOSIS_ALERT_WINDOW_DAYS,
    threshold: MISDIAGNOSIS_ALERT_THRESHOLD,
  });
  const pending = plans.filter((plan) => plan.notify);

  if (!pending.length) {
    return {
      ok: true,
      scanned: logs.rows.length,
      truncated: logs.truncated,
      groups: plans.length,
      notified: 0,
      skipped: plans.length,
      failed: 0,
    };
  }

  const managers = await listManagerWorkerNames(companyId);
  const withToken = await managersWithPushToken(companyId, managers);
  if (!withToken.length) {
    // eslint-disable-next-line no-console
    console.info('[misdiagnosis-alerts] 수신 토큰 없음', {
      companyId,
      managerCount: managers.length,
      pendingGroups: pending.length,
    });
    return {
      ok: true,
      scanned: logs.rows.length,
      truncated: logs.truncated,
      groups: plans.length,
      notified: 0,
      skipped: pending.length,
      failed: 0,
      reason: 'no_tokens',
    };
  }

  let notified = 0;
  let skipped = 0;
  let failed = 0;

  for (const plan of pending) {
    try {
      const body = formatMisdiagnosisAlertBody(plan, MISDIAGNOSIS_ALERT_WINDOW_DAYS);
      const pushResult = await sendPush({
        companyId,
        workerNames: withToken,
        title: '반복 오진',
        body,
        data: {
          type: 'ai_misdiagnosis',
          path: '/defects',
        },
      });

      if (!pushResult || pushResult.skipped || !(pushResult.successCount > 0)) {
        skipped += 1;
        // eslint-disable-next-line no-console
        console.info('[misdiagnosis-alerts] 푸시 미발송', {
          companyId,
          codeSet: plan.code_set,
          productName: plan.product_name,
          count: plan.count,
          successCount: pushResult?.successCount ?? 0,
          failedCount: pushResult?.failedCount ?? 0,
        });
        continue;
      }

      await saveAlertState(admin, plan, now);
      notified += 1;
    } catch (err) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.error('[misdiagnosis-alerts] push failed', err?.message || err);
    }
  }

  return {
    ok: failed === 0,
    scanned: logs.rows.length,
    truncated: logs.truncated,
    groups: plans.length,
    notified,
    skipped,
    failed,
  };
}

async function managersWithPushToken(companyId, names) {
  if (!names?.length) return [];
  const { data, error } = await supabase
    .from('worker_directory')
    .select('worker_name, expo_push_token, removed')
    .eq('company_id', companyId)
    .in('worker_name', names);
  if (error) throw new Error(error.message);
  return (data || [])
    .filter((row) => row.removed !== true && String(row.expo_push_token || '').trim() && row.worker_name)
    .map((row) => row.worker_name);
}

async function fetchCorrectionPage(admin, companyId, sinceIso) {
  const rows = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await admin
      .from('ai_correction_log')
      .select(
        'company_id, code_set, product_name, ai_suggested_code, final_code, was_ai_accepted, created_at'
      )
      .eq('company_id', companyId)
      .eq('was_ai_accepted', false)
      .gte('created_at', sinceIso)
      .not('product_name', 'is', null)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return { rows, truncated };
    if (page === MAX_PAGES - 1) truncated = true;
  }
  if (truncated) {
    // eslint-disable-next-line no-console
    console.error('[misdiagnosis-alerts] correction scan truncated', {
      companyId,
      rows: rows.length,
    });
  }
  return { rows, truncated };
}

async function fetchAlertPage(admin, companyId) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await admin
      .from('ai_misdiagnosis_alerts')
      .select(
        'company_id, code_set, product_name, ai_suggested_code, final_code, last_notified_count'
      )
      .eq('company_id', companyId)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
  return rows;
}

async function saveAlertState(admin, plan, now) {
  const patch = {
    occurrence_count: plan.count,
    last_notified_count: plan.count,
    last_notified_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  const { data, error } = await admin
    .from('ai_misdiagnosis_alerts')
    .update(patch)
    .eq('company_id', plan.company_id)
    .eq('code_set', plan.code_set)
    .eq('product_name', plan.product_name)
    .eq('ai_suggested_code', plan.ai_suggested_code)
    .eq('final_code', plan.final_code)
    .select('company_id');
  if (error) throw new Error(error.message);
  if (data?.length) return;

  const { error: insertError } = await admin.from('ai_misdiagnosis_alerts').insert({
    company_id: plan.company_id,
    code_set: plan.code_set,
    product_name: plan.product_name,
    ai_suggested_code: plan.ai_suggested_code,
    final_code: plan.final_code,
    ...patch,
  });
  if (insertError && insertError.code !== '23505') throw new Error(insertError.message);
}
