import { addWorklogReviewRow } from '../../../../lib/worklogReviewData.js';
import { runWorklogAdmin } from '../../../../lib/worklogReviewHttp.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  return runWorklogAdmin(request, ({ supabase, companyId }) => (
    addWorklogReviewRow(supabase, companyId, body)
  ));
}
