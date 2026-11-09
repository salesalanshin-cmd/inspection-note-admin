import { NextResponse } from 'next/server';
import { getCompanyId } from '../company.js';
import { isValidSession, SESSION_COOKIE_NAME } from '../session.js';
import { createServiceRoleClient } from '../supabaseAdmin.js';
import { fetchAllPages } from './pagedQuery.js';
import {
  isYmd,
  parseIdList,
  pickAttendanceDailyPatch,
  resolveAttendanceSelect,
  sanitizeEditLogRows,
} from './adminAccess.js';

export function requireAttendanceAdmin(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!isValidSession(token)) return null;
  return true;
}

export async function withAttendanceAdmin(request, handler) {
  if (!requireAttendanceAdmin(request)) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  try {
    const supabase = createServiceRoleClient();
    const companyId = await getCompanyId();
    const body = await handler({ request, supabase, companyId });
    if (body instanceof NextResponse) return body;
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const status = Number(err?.status) || 500;
    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error('[api/attendance/admin]', err?.message || err);
    }
    return NextResponse.json(
      { error: err?.message || '요청에 실패했습니다.' },
      { status }
    );
  }
}

async function readDailyPages(supabase, companyId, { from, to, workerName, select }) {
  const { rows, error, truncated } = await fetchAllPages(
    () => {
      let query = supabase
        .from('attendance_daily')
        .select(select)
        .eq('company_id', companyId)
        .gte('work_date', from)
        .lte('work_date', to);
      if (workerName) query = query.eq('worker_name', workerName);
      return query;
    },
    { timeColumn: 'work_date', label: 'attendance_daily', ascending: true }
  );
  if (error) throw new Error(error.message);
  return { rows, truncated: Boolean(truncated) };
}

async function readDailyByIds(supabase, companyId, ids, select) {
  const merged = new Map();
  for (let index = 0; index < ids.length; index += 200) {
    const chunk = ids.slice(index, index + 200);
    const { data, error } = await supabase
      .from('attendance_daily')
      .select(select)
      .eq('company_id', companyId)
      .in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of data || []) merged.set(String(row.id), row);
  }
  return [...merged.values()];
}

/** GET 조회: workDate 또는 from/to (+ ids, workerName, columns) */
export async function queryAttendanceDaily(supabase, companyId, searchParams) {
  const workDate = searchParams.get('workDate')?.trim() || '';
  const from = searchParams.get('from')?.trim() || workDate;
  const to = searchParams.get('to')?.trim() || workDate;
  const workerName = searchParams.get('workerName')?.trim() || '';
  const ids = parseIdList(searchParams.get('ids'));
  const selectRaw = resolveAttendanceSelect(searchParams.get('columns'));
  if (selectRaw?.error) {
    const error = new Error(selectRaw.error);
    error.status = 400;
    throw error;
  }
  const select = selectRaw;

  if (ids.length && !from) {
    return { rows: await readDailyByIds(supabase, companyId, ids, select), truncated: false };
  }

  if (!isYmd(from) || !isYmd(to) || from > to) {
    const error = new Error('workDate 또는 from/to(YYYY-MM-DD)가 필요합니다.');
    error.status = 400;
    throw error;
  }

  const ranged = await readDailyPages(supabase, companyId, {
    from,
    to,
    workerName: workerName || null,
    select,
  });

  if (!ids.length) return ranged;

  const byId = await readDailyByIds(supabase, companyId, ids, select);
  const merged = new Map();
  for (const row of ranged.rows) merged.set(String(row.id), row);
  for (const row of byId) merged.set(String(row.id), row);
  return { rows: [...merged.values()], truncated: ranged.truncated };
}

export async function updateAttendanceDailyRow(
  supabase,
  companyId,
  { id, patch: rawPatch, changes, source, originalRule, editedBy }
) {
  const rowId = String(id || '').trim();
  if (!rowId) {
    const error = new Error('id 가 필요합니다.');
    error.status = 400;
    throw error;
  }
  const picked = pickAttendanceDailyPatch(rawPatch || {}, companyId);
  if (!picked.ok) {
    const error = new Error(picked.error);
    error.status = 400;
    throw error;
  }
  const patch = {
    ...picked.patch,
    updated_at: picked.patch.updated_at || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('attendance_daily')
    .update(patch)
    .eq('id', rowId)
    .eq('company_id', companyId)
    .select('id, worker_name, work_date, judgment_rationale')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const missing = new Error('행을 찾지 못했습니다.');
    missing.status = 404;
    throw missing;
  }

  let logWarning = null;
  if (Array.isArray(changes) && changes.length) {
    const { buildAttendanceEditLogs } = await import('./excelImport.js');
    const prepared = buildAttendanceEditLogs({
      companyId,
      attendanceId: rowId,
      workerName: data.worker_name,
      workDate: data.work_date,
      changes,
      source: source || 'screen',
      originalRule: originalRule ?? data.judgment_rationale?.rule ?? null,
      editedBy: editedBy || patch.reviewed_by || 'admin',
      editedAt: patch.updated_at,
      batchId: crypto.randomUUID(),
    });
    const { error: logErr } = await supabase.from('attendance_edit_log').insert(prepared);
    if (logErr) logWarning = logErr.message;
  }

  return { ok: true, row: data, logWarning };
}

export async function applyAttendanceDailyBatch(supabase, companyId, body) {
  const updates = Array.isArray(body?.updates) ? body.updates : [];
  const confirms = Array.isArray(body?.confirms) ? body.confirms : [];
  const source = body?.source || 'excel';
  const editedBy = body?.editedBy || 'excel';
  const reviewedAt = body?.reviewedAt || new Date().toISOString();
  const batchId = body?.batchId || crypto.randomUUID();
  const { buildAttendanceEditLogs } = await import('./excelImport.js');

  const logs = [];
  for (const update of updates) {
    const picked = pickAttendanceDailyPatch(update?.patch || {}, companyId);
    if (!picked.ok) {
      const error = new Error(picked.error);
      error.status = 400;
      throw error;
    }
    const id = String(update.id || '').trim();
    if (!id) {
      const error = new Error('updates[].id 가 필요합니다.');
      error.status = 400;
      throw error;
    }
    const patch = {
      ...picked.patch,
      reviewed_at: reviewedAt,
      reviewed_by: editedBy,
      updated_at: reviewedAt,
    };
    const { error } = await supabase
      .from('attendance_daily')
      .update(patch)
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw new Error(error.message);
    logs.push(
      ...buildAttendanceEditLogs({
        companyId,
        attendanceId: id,
        workerName: update.workerName,
        workDate: update.workDate,
        changes: update.changes || [],
        source,
        originalRule: update.originalRule ?? null,
        editedBy,
        editedAt: reviewedAt,
        batchId,
      })
    );
  }

  for (const confirm of confirms) {
    const id = String(confirm?.id || '').trim();
    if (!id) continue;
    const { error } = await supabase
      .from('attendance_daily')
      .update({
        reviewed: true,
        reviewed_at: reviewedAt,
        reviewed_by: editedBy,
        updated_at: reviewedAt,
      })
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw new Error(error.message);
  }

  let logWarning = null;
  if (logs.length) {
    const { error: logErr } = await supabase.from('attendance_edit_log').insert(logs);
    if (logErr) logWarning = logErr.message;
  }

  return {
    ok: true,
    updated: updates.length,
    confirmed: confirms.length,
    logCount: logs.length,
    logWarning,
  };
}

export async function queryAttendanceEditLogs(supabase, companyId, searchParams) {
  const from = searchParams.get('from')?.trim() || '';
  const to = searchParams.get('to')?.trim() || '';
  if (!isYmd(from) || !isYmd(to) || from > to) {
    const error = new Error('from/to(YYYY-MM-DD)가 필요합니다.');
    error.status = 400;
    throw error;
  }
  const { rows, error, truncated } = await fetchAllPages(
    () =>
      supabase
        .from('attendance_edit_log')
        .select(
          'id, company_id, attendance_id, worker_name, work_date, field, old_value, new_value, source, original_rule, edited_by, edited_at, batch_id'
        )
        .eq('company_id', companyId)
        .gte('work_date', from)
        .lte('work_date', to),
    { timeColumn: 'edited_at', label: 'attendance_edit_log', ascending: false }
  );
  if (error) throw new Error(error.message);
  return { rows, truncated: Boolean(truncated) };
}

export async function insertAttendanceEditLogs(supabase, companyId, body) {
  const sanitized = sanitizeEditLogRows(body?.logs, companyId);
  if (!sanitized.ok) {
    const error = new Error(sanitized.error);
    error.status = 400;
    throw error;
  }
  const { error } = await supabase.from('attendance_edit_log').insert(sanitized.rows);
  if (error) throw new Error(error.message);
  return { ok: true, inserted: sanitized.rows.length };
}
