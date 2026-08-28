import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../../lib/company';
import { reembedChunk } from '../../../../../lib/documents/process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    const companyId = await getCompanyId();
    const chunkId = params.chunkId;
    const body = await request.json();
    const content = body.content?.toString();
    const isVerified = body.is_verified;

    if (!content?.trim()) {
      return NextResponse.json({ error: 'content가 필요합니다.' }, { status: 400 });
    }

    const extra = typeof isVerified === 'boolean' ? { is_verified: isVerified } : {};
    const chunk = await reembedChunk(chunkId, companyId, content.trim(), extra);
    return NextResponse.json({ chunk });
  } catch (err) {
    return NextResponse.json({ error: err?.message || '조각 수정 실패' }, { status: 500 });
  }
}
