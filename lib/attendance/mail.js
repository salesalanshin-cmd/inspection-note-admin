import { buildAttendanceExcelBuffer } from './excel.js';

/**
 * Resend API (fetch, 추가 의존성 없음).
 * env: RESEND_API_KEY, MAIL_FROM
 */

export function isMailEnabled(env = process.env) {
  return Boolean(
    env.RESEND_API_KEY?.trim() && env.MAIL_FROM?.trim()
  );
}

export async function fetchActiveMailRecipients(supabase, companyId) {
  const { data, error } = await supabase
    .from('attendance_mail_recipient')
    .select('email, display_name')
    .eq('company_id', companyId)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  return (data || [])
    .map((r) => String(r.email || '').trim())
    .filter(Boolean);
}

/**
 * @returns {Promise<{ ok: boolean, id?: string, error?: string, skipped?: boolean }>}
 */
export async function sendAttendanceMail({
  to,
  subject,
  text,
  excelBuffer,
  filename,
  env = process.env,
}) {
  if (!isMailEnabled(env)) {
    return { ok: false, skipped: true, error: 'mail_not_configured' };
  }
  const apiKey = env.RESEND_API_KEY.trim();
  const from = env.MAIL_FROM.trim();
  const recipients = Array.isArray(to) ? to : [to];
  if (!recipients.length) {
    return { ok: false, skipped: true, error: 'no_recipients' };
  }

  const body = {
    from,
    to: recipients,
    subject,
    text: text || subject,
    attachments: [
      {
        filename: filename || 'attendance.xlsx',
        content: Buffer.from(excelBuffer).toString('base64'),
      },
    ],
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    return {
      ok: false,
      error: parsed?.message || `HTTP ${res.status}`,
    };
  }

  return { ok: true, id: parsed?.id || null };
}

export async function sendAndLogAttendanceReport({
  supabase,
  companyId,
  kind,
  periodStart,
  periodEnd,
  rows,
  displayMap,
  subject,
}) {
  const recipients = await fetchActiveMailRecipients(supabase, companyId);
  const excelBuffer = buildAttendanceExcelBuffer(rows, displayMap);
  const filename = `근태_${kind}_${periodStart}_${periodEnd}.xlsx`;

  const { data: logRow, error: logInsErr } = await supabase
    .from('mail_log')
    .insert({
      company_id: companyId,
      kind,
      period_start: periodStart,
      period_end: periodEnd,
      to_emails: recipients,
      subject,
      status: 'pending',
      attempts: 0,
      meta: { rowCount: rows.length },
    })
    .select('id')
    .single();

  if (logInsErr) throw new Error(logInsErr.message);
  const logId = logRow.id;

  if (!recipients.length) {
    await supabase
      .from('mail_log')
      .update({
        status: 'skipped',
        error: 'no_recipients',
        attempts: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', logId);
    return { ok: true, skipped: true, reason: 'no_recipients', logId };
  }

  const result = await sendAttendanceMail({
    to: recipients,
    subject,
    text: `${subject}\n기간: ${periodStart} ~ ${periodEnd}\n건수: ${rows.length}`,
    excelBuffer,
    filename,
  });

  if (result.skipped) {
    await supabase
      .from('mail_log')
      .update({
        status: 'skipped',
        error: result.error || 'skipped',
        attempts: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', logId);
    return { ok: true, skipped: true, reason: result.error, logId };
  }

  if (!result.ok) {
    await supabase
      .from('mail_log')
      .update({
        status: 'failed',
        error: (result.error || 'send_failed').slice(0, 500),
        attempts: 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', logId);
    return { ok: false, error: result.error, logId };
  }

  await supabase
    .from('mail_log')
    .update({
      status: 'sent',
      provider_id: result.id,
      attempts: 1,
      sent_at: new Date().toISOString(),
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', logId);

  return { ok: true, logId, providerId: result.id };
}

/** 실패 mail_log 재시도 (최대 attempts < 3). 기간 데이터로 엑셀 재생성 */
export async function retryFailedMails(
  supabase,
  companyId,
  { limit = 5, displayMap = new Map() } = {}
) {
  const { fetchAttendanceRange } = await import('./compute.js');

  const { data: failed, error } = await supabase
    .from('mail_log')
    .select('*')
    .eq('company_id', companyId)
    .eq('status', 'failed')
    .lt('attempts', 3)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const results = [];
  for (const row of failed || []) {
    const recipients = row.to_emails || [];
    if (!recipients.length || !row.period_start || !row.period_end) continue;

    const rows = await fetchAttendanceRange(
      supabase,
      companyId,
      row.period_start,
      row.period_end
    );
    const excelBuffer = buildAttendanceExcelBuffer(rows, displayMap);
    const sendResult = await sendAttendanceMail({
      to: recipients,
      subject: `[재시도] ${row.subject || '근태 리포트'}`,
      text: `재시도 발송 (${row.period_start}~${row.period_end})`,
      excelBuffer,
      filename: `근태_retry_${row.period_start}_${row.period_end}.xlsx`,
    });

    const attempts = (row.attempts || 0) + 1;
    if (sendResult.ok) {
      await supabase
        .from('mail_log')
        .update({
          status: 'sent',
          attempts,
          provider_id: sendResult.id,
          sent_at: new Date().toISOString(),
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      results.push({ id: row.id, status: 'sent' });
    } else if (!sendResult.skipped) {
      await supabase
        .from('mail_log')
        .update({
          status: 'failed',
          attempts,
          error: (sendResult.error || '').slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      results.push({ id: row.id, status: 'failed' });
    }
  }
  return results;
}
