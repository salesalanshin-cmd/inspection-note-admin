import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { runOcrClassifyBatch } from '../../../../lib/ocrProcess.js';
import {
  isValidSession,
  SESSION_COOKIE_NAME,
} from '../../../../lib/session.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function authorizeOcrRequest(request) {
  if (authorizeCron(request)) {
    return { mode: 'cron' };
  }
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (isValidSession(token)) {
    return { mode: 'admin' };
  }
  return null;
}

/**
 * GET/POST /api/ocr/process
 * - Cron: CRON_SECRET (OCR_ENABLED=true 일 때만 실제 처리)
 * - 관리자 수동: 세션 쿠키 + ?limit=30&order=recent
 */
async function handle(request) {
  const auth = authorizeOcrRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get('limit');
  const orderRaw = url.searchParams.get('order');

  const manualOpts = {};
  if (auth.mode === 'admin') {
    if (limitRaw != null) {
      const n = Number(limitRaw);
      if (Number.isFinite(n) && n > 0) manualOpts.limit = Math.min(Math.floor(n), 50);
    }
    if (orderRaw === 'recent' || orderRaw === 'oldest') {
      manualOpts.order = orderRaw === 'recent' ? 'recent' : 'oldest';
    }
    // order=recent → created_at 최신순(기본이 recent)
    if (orderRaw === 'recent') {
      manualOpts.order = 'recent';
    }
    manualOpts.manual = true;
  }

  // cron 기본: 최신순
  if (!manualOpts.order) {
    manualOpts.order = 'recent';
  }

  try {
    // runOcrClassifyBatch: order 'oldest' only flips ascending; else newest first
    const result = await runOcrClassifyBatch({
      limit: manualOpts.limit,
      order: manualOpts.order === 'oldest' ? 'oldest' : 'recent',
      manual: Boolean(manualOpts.manual),
    });
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/ocr/process]', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'ocr process failed' },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
