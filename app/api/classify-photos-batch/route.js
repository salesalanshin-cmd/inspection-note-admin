import { NextResponse } from 'next/server';
import { classifyPhotosBatch } from '../../../lib/classifyService';

export const maxDuration = 60;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { items, codeSet } = body;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 });
  }
  if (!['defect', 'sos', 'doc'].includes(codeSet)) {
    return NextResponse.json(
      { error: 'codeSet must be defect, sos, or doc' },
      { status: 400 }
    );
  }

  for (const item of items) {
    if (!item?.id || !item?.imageUrl) {
      return NextResponse.json(
        { error: 'Each item must have id and imageUrl' },
        { status: 400 }
      );
    }
  }

  try {
    // 배치 내 ai_correction_log 조회 1회 → 프롬프트 재사용
    const results = await classifyPhotosBatch(items, codeSet);
    return NextResponse.json({ results });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[classify-photos-batch]', err);
    return NextResponse.json(
      { error: err.message || 'Batch classification failed' },
      { status: 500 }
    );
  }
}
