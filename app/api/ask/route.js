import { NextResponse } from 'next/server';
import { askQuestion } from '../../../lib/askService.js';
import { resolveAskAuth } from '../../../lib/askAuth.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-company-key',
};

function jsonWithCors(body, init = {}) {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return NextResponse.json(body, { ...init, headers });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request) {
  const started = Date.now();

  const auth = await resolveAskAuth(request);
  if (!auth) {
    return jsonWithCors({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const question = body.question?.toString()?.trim();
  if (!question) {
    return jsonWithCors({ error: 'question이 필요합니다.' }, { status: 400 });
  }

  try {
    const matchCount = Number(body.matchCount) || 5;
    const minSimilarity = Number(body.minSimilarity) || 0.43;

    const result = await askQuestion(question, {
      companyId: auth.companyId,
      matchCount,
      minSimilarity,
    });

    const payload = {
      answer: result.answer,
      sources: result.sources,
      status: result.status,
    };

    if (auth.authMethod === 'session') {
      payload.hits = result.hits.map((h) => ({
        sourceKind: h.sourceKind,
        content: h.content,
        sourceLabel: h.sourceLabel,
        documentTitle: h.documentTitle,
        pageFrom: h.pageFrom,
        similarity: h.similarity,
        label: h.sourceLabel || h.documentTitle,
      }));
      payload.blockedLayer = result.blockedLayer;
      payload.elapsedMs = Date.now() - started;
    }

    return jsonWithCors(payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/ask]', err);
    return jsonWithCors(
      { error: err?.message || '질문 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}
