import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import {
  isValidSession,
  SESSION_COOKIE_NAME,
} from '../../../../lib/session.js';
import { runWorklogExtractBatch } from '../../../../lib/worklogExtractJob.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 800;

/**
 * POST /api/ocr/extract — Vercel Cron (CRON_SECRET)
 * GET  /api/ocr/extract?run=1&limit=N — 관리자 세션, 같은 로직을 N건만
 */
async function handle(request) {
  const cron = authorizeCron(request);
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const admin = isValidSession(token);
  const url = new URL(request.url);
  const manual = admin && url.searchParams.get('run') === '1';
  if (!cron && !manual) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let limit;
  if (manual) {
    const n = Number(url.searchParams.get('limit'));
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json(
        { error: 'limit은 1 이상의 정수여야 합니다.' },
        { status: 400 }
      );
    }
    limit = Math.min(Math.floor(n), 50);
  }

  try {
    const result = await runWorklogExtractBatch({ limit });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[api/ocr/extract]', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'ocr extract failed' },
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
