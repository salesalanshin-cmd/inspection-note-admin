import {
  queryInspectionHeaderDetail,
  withInspectionAdmin,
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
