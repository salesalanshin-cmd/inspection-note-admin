import { NextResponse } from 'next/server';
import { resolveAskAuth } from '../../../../lib/askAuth.js';
import { getCompanyId } from '../../../../lib/company.js';
import { createServiceRoleClient } from '../../../../lib/supabaseAdmin.js';
import { localizeNotices, noticeTranslationStore, parseNoticeRequest } from '../../../../lib/noticeTranslation.js';
import { translateNoticeTexts } from '../../../../lib/noticeTranslationProvider.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-company-key',
  'Cache-Control': 'private, no-store',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers });
}

const reply = (body, status) => NextResponse.json(body, { status, headers });

export async function POST(request) {
  try {
    const auth = await resolveAskAuth(request);
    if (!auth?.companyId) return reply({ error: 'unauthorized' }, 401);
    if (auth.companyId !== await getCompanyId()) return reply({ error: 'forbidden' }, 403);
    const parsed = parseNoticeRequest(await request.json().catch(() => null));
    if (!parsed) return reply({ error: 'invalid_notice_translation_request' }, 400);
    const store = noticeTranslationStore(createServiceRoleClient(), auth.companyId);
    return reply(await localizeNotices(store, parsed, (sources, locale) =>
      translateNoticeTexts(sources, locale, auth.companyId, request.signal)), 200);
  } catch {
    return reply({ error: 'notice_translation_unavailable' }, 503);
  }
}
