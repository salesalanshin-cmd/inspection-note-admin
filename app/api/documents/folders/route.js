import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../lib/company';
import { canCreateUnder } from '../../../../lib/documents/folders';
import { supabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const companyId = await getCompanyId();
    const { data, error } = await supabase
      .from('document_folder')
      .select('id, company_id, parent_id, name, created_at')
      .eq('company_id', companyId)
      .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ folders: data || [] });
  } catch (err) {
    return NextResponse.json({ error: err?.message || '폴더 조회 실패' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const companyId = await getCompanyId();
    const body = await request.json();
    const name = body.name?.toString()?.trim();
    const parentId = body.parentId?.toString()?.trim() || null;

    if (!name) {
      return NextResponse.json({ error: '폴더 이름을 입력하세요.' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('document_folder')
      .select('id, parent_id')
      .eq('company_id', companyId);
    const byId = new Map((existing || []).map((f) => [f.id, f]));

    if (parentId) {
      if (!byId.has(parentId)) {
        return NextResponse.json({ error: '상위 폴더를 찾을 수 없습니다.' }, { status: 404 });
      }
      if (!canCreateUnder(parentId, byId)) {
        return NextResponse.json(
          { error: `폴더는 최대 ${3}단계까지만 만들 수 있습니다.` },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase
      .from('document_folder')
      .insert({ company_id: companyId, parent_id: parentId, name })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ folder: data });
  } catch (err) {
    return NextResponse.json({ error: err?.message || '폴더 생성 실패' }, { status: 500 });
  }
}
