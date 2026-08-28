import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { findActiveByFileName } from '../../../../lib/documents/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const companyId = await getCompanyId();
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('fileName')?.trim();
    if (!fileName) {
      return NextResponse.json({ error: 'fileName이 필요합니다.' }, { status: 400 });
    }

    const existing = await findActiveByFileName(fileName, companyId);
    return NextResponse.json({ existing: existing || null });
  } catch (err) {
    return NextResponse.json({ error: err?.message || '조회 실패' }, { status: 500 });
  }
}
