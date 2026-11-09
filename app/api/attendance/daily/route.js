import {
  applyAttendanceDailyBatch,
  queryAttendanceDaily,
  updateAttendanceDailyRow,
  withAttendanceAdmin,
} from '../../../../lib/attendance/adminHttp.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** GET ?workDate= | ?from=&to= [&workerName=&ids=&columns=] */
export async function GET(request) {
  return withAttendanceAdmin(request, async ({ supabase, companyId }) => {
    const url = new URL(request.url);
    return queryAttendanceDaily(supabase, companyId, url.searchParams);
  });
}

/** PATCH { id, patch, changes?, source?, originalRule?, editedBy? } */
export async function PATCH(request) {
  return withAttendanceAdmin(request, async ({ supabase, companyId }) => {
    let body;
    try {
      body = await request.json();
    } catch {
      const error = new Error('Invalid body');
      error.status = 400;
      throw error;
    }
    return updateAttendanceDailyRow(supabase, companyId, body || {});
  });
}

/** POST batch apply { updates, confirms, source?, editedBy? } — 엑셀 반영 */
export async function POST(request) {
  return withAttendanceAdmin(request, async ({ supabase, companyId }) => {
    let body;
    try {
      body = await request.json();
    } catch {
      const error = new Error('Invalid body');
      error.status = 400;
      throw error;
    }
    return applyAttendanceDailyBatch(supabase, companyId, body || {});
  });
}
