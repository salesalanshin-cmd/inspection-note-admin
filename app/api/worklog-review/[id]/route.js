import { completeWorklogReviewPhoto, getWorklogReviewPhoto } from '../../../../lib/worklogReviewData.js';
import { runWorklogAdmin } from '../../../../lib/worklogReviewHttp.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  return runWorklogAdmin(request, ({ supabase, companyId }) => (
    getWorklogReviewPhoto(supabase, companyId, params.id)
  ));
}

export async function POST(request, { params }) {
  return runWorklogAdmin(request, ({ supabase, companyId }) => (
    completeWorklogReviewPhoto(supabase, companyId, params.id)
  ));
}
