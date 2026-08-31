import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { supabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** failed 상태 문서 일괄 is_active=false (삭제 아님) */
export async function POST() {
  try {
    const companyId = await getCompanyId();
    const { data, error } = await supabase
      .from('document')
      .update({ is_active: false })
      .eq('company_id', companyId)
      .eq('status', 'failed')
      .eq('is_active', true)
      .select('id');
    if (error) throw new Error(error.message);
    return NextResponse.json({ count: data?.length ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: err?.message || '정리 실패' }, { status: 500 });
  }
}
