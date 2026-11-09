import { listWorklogReview } from '../../../lib/worklogReviewData.js';
import { runWorklogAdmin } from '../../../lib/worklogReviewHttp.js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET(request) {
  const url = new URL(request.url);
  return runWorklogAdmin(request, ({ supabase, companyId }) => listWorklogReview(supabase, companyId, {
    scope: url.searchParams.get('scope') || 'needs',
    from: url.searchParams.get('from') || '',
    to: url.searchParams.get('to') || '',
    form: url.searchParams.get('form') || 'all',
  }));
}
