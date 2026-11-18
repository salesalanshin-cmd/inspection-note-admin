import { NextResponse } from 'next/server';
import { classifyPhoto } from '../../../lib/classifyService';
import { fetchProductDefectStats } from '../../../lib/classifyPrompt';
import { normalizeProcessHint } from '../../../lib/processHint';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { imageUrl, codeSet, regionCrop, productName, processHint } = body;
  if (!imageUrl || !['defect', 'sos', 'doc'].includes(codeSet)) {
    return NextResponse.json(
      { error: 'imageUrl and codeSet(defect|sos|doc) are required' },
      { status: 400 }
    );
  }

  try {
    const trimmedProduct =
      codeSet === 'defect' && productName ? String(productName).trim() : '';
    let productDefectStats;
    if (trimmedProduct) {
      productDefectStats = await fetchProductDefectStats(trimmedProduct);
    }

    const hint =
      codeSet === 'defect' ? normalizeProcessHint(processHint) : '없음';

    // 부정 증거 집계는 classifyPhoto 안에서 모델 호출 전에 수행
    const result = await classifyPhoto(imageUrl, codeSet, {
      regionCrop: Boolean(regionCrop),
      productName: trimmedProduct || undefined,
      productDefectStats: trimmedProduct ? productDefectStats : undefined,
      processHint: hint,
    });
    return NextResponse.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[classify-photo]', err);
    return NextResponse.json(
      { error: err.message || 'Classification failed' },
      { status: 500 }
    );
  }
}
