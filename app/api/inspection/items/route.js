import {
  createInspectionItem,
  queryInspectionItems,
  updateInspectionItem,
  withInspectionAdmin,
} from '../../../../lib/inspection/adminHttp.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** GET ?process=&kind=&includeInactive= */
export async function GET(request) {
  return withInspectionAdmin(request, async ({ supabase, companyId }) => {
    const url = new URL(request.url);
    return queryInspectionItems(supabase, companyId, url.searchParams);
  });
}

/** POST { process, kind, item_no, title, ... } */
export async function POST(request) {
  return withInspectionAdmin(request, async ({ supabase, companyId }) => {
    let body;
    try {
      body = await request.json();
    } catch {
      const error = new Error('Invalid body');
      error.status = 400;
      throw error;
    }
    return createInspectionItem(supabase, companyId, body || {});
  });
}

/** PATCH { id, patch } */
export async function PATCH(request) {
  return withInspectionAdmin(request, async ({ supabase, companyId }) => {
    let body;
    try {
      body = await request.json();
    } catch {
      const error = new Error('Invalid body');
      error.status = 400;
      throw error;
    }
    return updateInspectionItem(supabase, companyId, body || {});
  });
}
