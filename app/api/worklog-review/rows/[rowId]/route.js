import { deleteWorklogReviewRow, saveWorklogReviewRow } from '../../../../../lib/worklogReviewData.js';
import { runWorklogAdmin } from '../../../../../lib/worklogReviewHttp.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  return runWorklogAdmin(request, ({ supabase, companyId }) => (
    saveWorklogReviewRow(supabase, companyId, params.rowId, body)
  ));
}

export async function DELETE(request, { params }) {
  return runWorklogAdmin(request, ({ supabase, companyId }) => (
    deleteWorklogReviewRow(supabase, companyId, params.rowId)
  ));
}
