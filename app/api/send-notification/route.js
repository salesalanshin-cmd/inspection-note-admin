import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { sendAlimtalk, TEMPLATE_IDS } from '../../../lib/solapiClient';

/**
 * POST /api/send-notification
 * body: { targets: [{ workerName, phoneNumber, templateType, variables }] }
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const targets = Array.isArray(body?.targets) ? body.targets : null;
  if (!targets || targets.length === 0) {
    return NextResponse.json({ error: '발송 대상(targets)이 없습니다.' }, { status: 400 });
  }

  const results = [];

  for (const target of targets) {
    const workerName = String(target?.workerName || '');
    const phoneNumber = String(target?.phoneNumber || '');
    const templateType = String(target?.templateType || '');
    const variables =
      target?.variables && typeof target.variables === 'object' ? target.variables : {};

    if (!workerName) {
      results.push({ workerName: '', success: false, error: '작업자명이 없습니다.' });
      continue;
    }

    if (!phoneNumber) {
      results.push({
        workerName,
        success: false,
        error: '연락처가 없습니다.',
      });
      await insertLog({
        workerName,
        phoneNumber: '',
        templateType,
        status: 'failed',
        errorMessage: '연락처가 없습니다.',
        variables,
      });
      continue;
    }

    const sendResult = await sendAlimtalk({
      to: phoneNumber,
      templateType,
      variables,
    });

    const success = Boolean(sendResult.success);
    results.push({
      workerName,
      success,
      messageId: sendResult.messageId || undefined,
      error: success ? undefined : sendResult.error || '발송 실패',
    });

    await insertLog({
      workerName,
      phoneNumber,
      templateType,
      templateId: sendResult.templateId || TEMPLATE_IDS[templateType] || null,
      status: success ? 'sent' : 'failed',
      messageId: sendResult.messageId || null,
      errorMessage: success ? null : sendResult.error || '발송 실패',
      variables,
    });
  }

  return NextResponse.json({ results });
}

async function insertLog({
  workerName,
  phoneNumber,
  templateType,
  templateId = null,
  status,
  messageId = null,
  errorMessage = null,
  variables = {},
}) {
  try {
    const { error } = await supabase.from('notification_send_log').insert({
      worker_name: workerName,
      phone_number: phoneNumber,
      template_type: templateType || null,
      template_id: templateId,
      status,
      message_id: messageId,
      error_message: errorMessage,
      variables,
    });
    if (error) {
      console.error('[send-notification] log insert failed', error.message);
    }
  } catch (err) {
    console.error('[send-notification] log insert error', err);
  }
}
