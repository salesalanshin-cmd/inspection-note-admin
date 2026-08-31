import { NextResponse } from 'next/server';
import { getCompanyId } from '../../../../../lib/company';
import { canCreateUnder, folderDepth } from '../../../../../lib/documents/folders';
import { supabase } from '../../../../../lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  try {
    const companyId = await getCompanyId();
    const folderId = params.id;
    const body = await request.json();
    const patch = {};

    if (body.name != null) {
      const name = body.name.toString().trim();
      if (!name) {
        return NextResponse.json({ error: '폴더 이름을 입력하세요.' }, { status: 400 });
      }
      patch.name = name;
    }

    if (body.parentId !== undefined) {
      const parentId = body.parentId?.toString()?.trim() || null;
      const { data: all } = await supabase
        .from('document_folder')
        .select('id, parent_id')
        .eq('company_id', companyId);
      const byId = new Map((all || []).map((f) => [f.id, f]));

      if (parentId === folderId) {
        return NextResponse.json({ error: '자기 자신을 상위 폴더로 지정할 수 없습니다.' }, { status: 400 });
      }

      if (parentId) {
        if (!byId.has(parentId)) {
          return NextResponse.json({ error: '상위 폴더를 찾을 수 없습니다.' }, { status: 404 });
        }
        let cursor = parentId;
        const seen = new Set();
        while (cursor) {
          if (cursor === folderId) {
            return NextResponse.json({ error: '하위 폴더를 상위로 지정할 수 없습니다.' }, { status: 400 });
          }
          if (seen.has(cursor)) break;
          seen.add(cursor);
          cursor = byId.get(cursor)?.parent_id;
        }
        const newDepth = folderDepth(parentId, byId) + 1;
        if (newDepth > 3) {
          return NextResponse.json({ error: '폴더 깊이는 3단계를 넘을 수 없습니다.' }, { status: 400 });
        }
      }
      patch.parent_id = parentId;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('document_folder')
      .update(patch)
      .eq('id', folderId)
      .eq('company_id', companyId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ folder: data });
  } catch (err) {
    return NextResponse.json({ error: err?.message || '폴더 수정 실패' }, { status: 500 });
  }
}

/** 삭제 — 문서·하위 폴더는 상위(parent)로 이동, 문서는 삭제하지 않음 */
export async function DELETE(_request, { params }) {
  try {
    const companyId = await getCompanyId();
    const folderId = params.id;

    const { data: folder, error: fetchErr } = await supabase
      .from('document_folder')
      .select('id, parent_id')
      .eq('id', folderId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!folder) {
      return NextResponse.json({ error: '폴더를 찾을 수 없습니다.' }, { status: 404 });
    }

    const moveTo = folder.parent_id;

    const { error: docErr } = await supabase
      .from('document')
      .update({ folder_id: moveTo })
      .eq('company_id', companyId)
      .eq('folder_id', folderId);
    if (docErr) throw new Error(docErr.message);

    const { error: childErr } = await supabase
      .from('document_folder')
      .update({ parent_id: moveTo })
      .eq('company_id', companyId)
      .eq('parent_id', folderId);
    if (childErr) throw new Error(childErr.message);

    const { error: delErr } = await supabase
      .from('document_folder')
      .delete()
      .eq('id', folderId)
      .eq('company_id', companyId);
    if (delErr) throw new Error(delErr.message);

    return NextResponse.json({ ok: true, movedTo: moveTo });
  } catch (err) {
    return NextResponse.json({ error: err?.message || '폴더 삭제 실패' }, { status: 500 });
  }
}
