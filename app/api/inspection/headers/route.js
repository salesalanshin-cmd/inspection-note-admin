import { queryInspectionHeaders, withInspectionAdmin } from '../../../../lib/inspection/adminHttp.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** GET ?date=&kind=&equipment= */
export async function GET(request) {
  return withInspectionAdmin(request, async ({ supabase, companyId }) => {
    const url = new URL(request.url);
    return queryInspectionHeaders(supabase, companyId, url.searchParams);
  });
}
