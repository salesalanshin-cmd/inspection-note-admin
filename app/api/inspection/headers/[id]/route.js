import {
  queryInspectionHeaderDetail,
  withInspectionAdmin,
  changeInspectionRound,
} from '../../../../../lib/inspection/adminHttp.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** GET /api/inspection/headers/[id] */
export async function GET(request, { params }) {
  return withInspectionAdmin(request, async ({ supabase, companyId }) => {
    const id = params?.id;
    return queryInspectionHeaderDetail(supabase, companyId, id);
  });
}

export async function PATCH(request, { params }) {
  return withInspectionAdmin(request, async ({ supabase, companyId }) => {
    const origin = request.headers.get('origin');
    if (origin && new URL(request.url).origin !== origin)
      throw Object.assign(new Error('요청 출처를 확인해주세요.'), {status: 403});
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      throw Object.assign(new Error('JSON 요청이 필요합니다.'), {status: 415});
    return changeInspectionRound(supabase, companyId, params.id, await request.json());
  });
}
