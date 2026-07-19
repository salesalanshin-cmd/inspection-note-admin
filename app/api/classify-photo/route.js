import { NextResponse } from 'next/server';
import { classifyPhoto } from '../../../lib/classifyService';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { imageUrl, codeSet, regionCrop } = body;
  if (!imageUrl || !['defect', 'sos', 'doc'].includes(codeSet)) {
    return NextResponse.json(
      { error: 'imageUrl and codeSet(defect|sos|doc) are required' },
      { status: 400 }
    );
  }

  try {
    // buildClassifyPrompt → ai_correction_log 과거 사례 조회 포함
    const result = await classifyPhoto(imageUrl, codeSet, {
      regionCrop: Boolean(regionCrop),
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
