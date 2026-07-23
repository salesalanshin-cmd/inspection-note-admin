import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import {
  getOverdueFrequentCheckWorkers,
  getDisplayName,
  getWorkDateForRecord,
} from '../../../../lib/analytics';
import { sendAlimtalk } from '../../../../lib/solapiClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function authorize(request) {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return false;

  const auth = request.headers.get('authorization') || '';
  if (auth === `Bearer ${secret}`) return true;

  const headerSecret = request.headers.get('x-cron-secret') || '';
  if (headerSecret === secret) return true;

  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret') || url.searchParams.get('CRON_SECRET');
  if (querySecret === secret) return true;

  return false;
}

async function fetchReportBundles() {
  const NOT_DELETED = 'is_deleted.eq.false,is_deleted.is.null';
  const [defectsRes, goodsRes, directoryRes] = await Promise.all([
    supabase.from('defect_reports').select('*').or(NOT_DELETED),
    supabase.from('good_reports').select('*').or(NOT_DELETED),
    supabase.from('worker_directory').select('*'),
  ]);

  if (defectsRes.error) throw new Error(defectsRes.error.message);
  if (goodsRes.error) throw new Error(goodsRes.error.message);
  if (directoryRes.error) throw new Error(directoryRes.error.message);

  return {
    defects: defectsRes.data || [],
    goods: goodsRes.data || [],
    workerDirectory: directoryRes.data || [],
  };
}

async function hasExistingAutoSend(autoKey) {
  const { data, error } = await supabase
    .from('notification_send_log')
    .select('id')
    .eq('auto_key', autoKey)
    .limit(1);
  if (error) {
    console.error('[auto-notify] auto_key lookup failed', error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function insertLog(row) {
  const { error } = await supabase.from('notification_send_log').insert(row);
  if (error) {
    console.error('[auto-notify] log insert failed', error.message);
  }
}

async function runAutoNotify() {
  const { data: setting, error: settingError } = await supabase
    .from('automation_settings')
    .select('enabled')
    .eq('key', 'frequent_check_auto_send')
    .maybeSingle();

  if (settingError) {
    return NextResponse.json({ error: settingError.message }, { status: 500 });
  }

  if (!setting?.enabled) {
    return NextResponse.json({
      checked: 0,
      sent: 0,
      skipped: 0,
      disabled: true,
      message: 'frequent_check_auto_send is off',
    });
  }

  const now = new Date();
  const { defects, goods, workerDirectory } = await fetchReportBundles();
  const targets = getOverdueFrequentCheckWorkers(defects, goods, workerDirectory, now);
  const workDate = getWorkDateForRecord(now);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const target of targets) {
    const stagesKey = target.overdueStages.join(',');
    const autoKey = `frequent_check:${workDate}:${target.worker_name}:${stagesKey}`;

    if (await hasExistingAutoSend(autoKey)) {
      skipped += 1;
      continue;
    }

    const displayName = getDisplayName(target.worker_name, workerDirectory);
    const phone = String(target.phone_number || '').trim();

    if (!phone) {
      await insertLog({
        worker_name: target.worker_name,
        phone_number: '',
        template_type: 'frequent_check',
        status: 'failed',
        error_message: '연락처 미등록',
        auto_key: autoKey,
        created_at: now.toISOString(),
        sent_at: null,
      });
      skipped += 1;
      continue;
    }

    const sendResult = await sendAlimtalk({
      to: phone,
      templateType: 'frequent_check',
      variables: {
        작업자명: displayName,
        미실시항목: target.overdueStages.join('/'),
      },
    });

    const success = Boolean(sendResult.success);
    await insertLog({
      worker_name: target.worker_name,
      phone_number: phone,
      template_type: 'frequent_check',
      status: success ? 'sent' : 'failed',
      error_message: success ? null : sendResult.error || '발송 실패',
      auto_key: autoKey,
      created_at: now.toISOString(),
      sent_at: success ? now.toISOString() : null,
    });

    if (success) sent += 1;
    else failed += 1;
  }

  return NextResponse.json({
    checked: targets.length,
    sent,
    skipped,
    failed,
    workDate,
  });
}

export async function GET(request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return await runAutoNotify();
  } catch (err) {
    console.error('[auto-notify]', err);
    return NextResponse.json(
      { error: err?.message || 'auto-notify failed' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  return GET(request);
}
