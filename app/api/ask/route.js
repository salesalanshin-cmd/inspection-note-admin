import { NextResponse } from 'next/server';
import { askQuestion } from '../../../lib/askService.js';
import { getCompanyId } from '../../../lib/company.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request) {
  const started = Date.now();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const question = body.question?.toString()?.trim();
  if (!question) {
    return NextResponse.json({ error: 'question이 필요합니다.' }, { status: 400 });
  }

  try {
    const companyId = await getCompanyId();
    const matchCount = Number(body.matchCount) || 5;
    const minSimilarity = Number(body.minSimilarity) || 0.43;

    const result = await askQuestion(question, { companyId, matchCount, minSimilarity });

    return NextResponse.json({
      answer: result.answer,
      sources: result.sources,
      status: result.status,
      hits: result.hits.map((h) => ({
        sourceKind: h.sourceKind,
        content: h.content,
        sourceLabel: h.sourceLabel,
        documentTitle: h.documentTitle,
        pageFrom: h.pageFrom,
        similarity: h.similarity,
        label: h.sourceLabel || h.documentTitle,
      })),
      blockedLayer: result.blockedLayer,
      elapsedMs: Date.now() - started,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/ask]', err);
    return NextResponse.json(
      { error: err?.message || '질문 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}
