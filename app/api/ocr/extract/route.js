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

const MAX_IDS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseIds(value) {
  if (value == null) return null;
  const ids = [];
  const seen = new Set();
  for (const part of String(value).split(',')) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * POST /api/ocr/extract — Vercel Cron (CRON_SECRET)
 * GET  /api/ocr/extract?run=1&limit=N — 관리자 세션, 같은 로직을 N건만
 * GET  /api/ocr/extract?run=1&ids=id1,id2 — 관리자 세션. 분류 상태와 무관하게 그 행만
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
  let ids;
  if (manual) {
    ids = parseIds(url.searchParams.get('ids'));
    if (ids) {
      if (ids.length === 0) {
        return NextResponse.json({ error: 'ids가 비어 있습니다.' }, { status: 400 });
      }
      if (ids.length > MAX_IDS) {
        return NextResponse.json(
          { error: `ids는 ${MAX_IDS}개까지입니다.` },
          { status: 400 }
        );
      }
      if (ids.some((id) => !UUID_RE.test(id))) {
        return NextResponse.json(
          { error: 'ids는 쉼표로 구분한 uuid여야 합니다.' },
          { status: 400 }
        );
      }
    } else {
      const n = Number(url.searchParams.get('limit'));
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json(
          { error: 'limit은 1 이상의 정수여야 합니다.' },
          { status: 400 }
        );
      }
      limit = Math.min(Math.floor(n), 50);
    }
  }

  try {
    const result = await runWorklogExtractBatch({ limit, ids });
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
