import {
  insertAttendanceEditLogs,
  queryAttendanceEditLogs,
  withAttendanceAdmin,
} from '../../../../lib/attendance/adminHttp.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** GET ?from=&to= */
export async function GET(request) {
  return withAttendanceAdmin(request, async ({ supabase, companyId }) => {
    const url = new URL(request.url);
    return queryAttendanceEditLogs(supabase, companyId, url.searchParams);
  });
}

/** POST { logs: [...] } — 필요 시 단독 이력 추가 */
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
    return insertAttendanceEditLogs(supabase, companyId, body || {});
  });
}
