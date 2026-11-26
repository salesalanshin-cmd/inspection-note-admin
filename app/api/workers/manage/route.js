import { NextResponse } from 'next/server';
import { withInspectionAdmin } from '../../../../lib/inspection/adminHttp';
import { confirmedWrite } from '../../../../lib/confirmedWrite';

const editable = new Set([
  'display_name','nationality','default_shift','process','organization','role','lang','phone_number','note',
  'removed','excluded','default_equipment_id','handles_frequent_check','handles_fives','handles_documents','handles_defects',
  'equipment_access_role','equipment_processes','equipment_location','equipment_codes',
]);

export async function POST(request) {
  return withInspectionAdmin(request, async ({ supabase, companyId }) => {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (!host || (origin !== 'https://' + host && origin !== 'http://' + host)) {
      return NextResponse.json({ error: '요청 출처를 확인해주세요.' }, { status: 403 });
    }
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return NextResponse.json({ error: 'JSON 요청이 필요합니다.' }, { status: 415 });
    }
    const { action, name, changes } = (await request.json().catch(() => null)) || {};
    if (!['create','update'].includes(action) || typeof name !== 'string' || !name.trim() || name !== name.trim() ||
        name.length > 100 || !changes || typeof changes !== 'object' || Array.isArray(changes) ||
        !Object.keys(changes).length || Object.keys(changes).some(key => !editable.has(key))) {
      return NextResponse.json({ error: '작업자와 편집 항목을 확인해주세요.' }, { status: 400 });
    }
    const table = supabase.from('worker_directory');
    const query = action === 'create' ? table.insert({ ...changes, worker_name: name, company_id: companyId })
      : table.update(changes).eq('company_id',companyId).eq('worker_name',name);
    const { data, error } = await confirmedWrite(query,'worker_name');
    if (error || data?.worker_name !== name) {
      return NextResponse.json({ error: '작업자 저장 결과를 확인할 수 없습니다. 목록을 새로고침해주세요.' }, { status: 409 });
    }
    return { data };
  });
}
