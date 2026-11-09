/**
 * 저장된 working_report 행에 이름 매칭·공정 판별 규칙을 다시 적용한다(재추출 없음).
 */

import { resolveProcessCode } from './worklogExtract.js';
import { recomputeWorklogDedup } from './worklogExtractJob.js';
import {
  buildWorkerNameIndex,
  matchSheetWorkers,
  matchUploader,
} from './worklogWorkerMatch.js';
import { createServiceRoleClient } from './supabaseAdmin.js';

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value };
  return {};
}

async function loadDirectory(supabase, companyId) {
  const { data, error } = await supabase
    .from('worker_directory')
    .select('worker_name, process, removed, excluded')
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
  return data || [];
}

async function fetchWorkingReportRows(supabase, companyId) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < 100000; from += pageSize) {
    let query = supabase
      .from('worklog_rows')
      .select('id, company_id, form_type, process_code, sheet_worker, uploader_name, raw')
      .eq('form_type', 'working_report')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    query = companyId ? query.eq('company_id', companyId) : query.is('company_id', null);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/** 공정 칸은 추출 raw.site 에만 있다. */
export function siteOfRow(row) {
  const raw = asObject(row?.raw);
  return raw.site ?? null;
}

/**
 * 한 행의 process_code / raw.matched_workers / raw.process_inferred 를 계산한다.
 * needs_review 는 건드리지 않는다.
 */
export function computeWorklogProcessPatch(row, workerIndex) {
  const matchedWorkers = matchSheetWorkers(row.sheet_worker, workerIndex);
  const uploaderMatch = matchUploader(row.uploader_name, workerIndex);
  const site = siteOfRow(row);
  const { processCode, processInferred } = resolveProcessCode('working_report', site, {
    matchedWorkers,
    uploaderMatch,
  });
  const raw = asObject(row.raw);
  raw.matched_workers = matchedWorkers;
  if (processInferred) raw.process_inferred = processInferred;
  else delete raw.process_inferred;
  return {
    process_code: processCode,
    raw,
    processInferred,
    previousProcessCode: row.process_code ?? null,
  };
}

/**
 * @param {string|null} companyId
 * @param {{ supabaseAdmin?: object }} [opts]
 */
export async function reapplyWorklogProcessInference(companyId, opts = {}) {
  const supabase = opts.supabaseAdmin || createServiceRoleClient();
  const directory = await loadDirectory(supabase, companyId);
  const workerIndex = buildWorkerNameIndex(directory);
  const rows = await fetchWorkingReportRows(supabase, companyId);

  const stats = {
    scanned: rows.length,
    updated: 0,
    unchanged: 0,
    becameIn: { worker: 0, uploader: 0, site: 0, total: 0 },
    leftIn: 0,
    otherProcess: 0,
  };

  const concurrency = 20;
  for (let index = 0; index < rows.length; index += concurrency) {
    const chunk = rows.slice(index, index + concurrency);
    await Promise.all(chunk.map(async (row) => {
      const patch = computeWorklogProcessPatch(row, workerIndex);
      const prev = row.process_code ?? null;
      const next = patch.process_code;
      const rawChanged = JSON.stringify(asObject(row.raw)) !== JSON.stringify(patch.raw);
      const codeChanged = prev !== next;
      if (!codeChanged && !rawChanged) {
        stats.unchanged += 1;
        return;
      }

      const { error } = await supabase
        .from('worklog_rows')
        .update({ process_code: next, raw: patch.raw })
        .eq('id', row.id);
      if (error) throw new Error(error.message);
      stats.updated += 1;

      if (prev !== 'IN' && next === 'IN') {
        stats.becameIn.total += 1;
        if (patch.processInferred === 'worker') stats.becameIn.worker += 1;
        else if (patch.processInferred === 'uploader') stats.becameIn.uploader += 1;
        else stats.becameIn.site += 1;
      } else if (prev === 'IN' && next !== 'IN') {
        stats.leftIn += 1;
      } else if (next && next !== 'IN' && prev !== next) {
        stats.otherProcess += 1;
      }
    }));
  }

  const dedup = await recomputeWorklogDedup(companyId, { supabaseAdmin: supabase });
  return { ...stats, dedup };
}
