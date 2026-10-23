import {
  buildWorkerDirIndex,
  fetchLotAttendanceSignals,
  resolveWorkerName,
} from './lotSources.js';
import { summarizeSignals } from './signalUtils.js';
import { getAttendanceSignalQueryRange } from './shift.js';

export { summarizeSignals };

/**
 * 출근 신호 합집합 (OR).
 * 조회 범위: ATTENDANCE_SIGNAL_QUERY (기본 D-1 17:00 ~ D+1 09:00).
 * 교대 구간 필터는 judge/shift 쪽에서 수행.
 */

const NOT_DELETED = 'is_deleted.eq.false,is_deleted.is.null';

/**
 * @param {object} supabase
 * @param {string} companyId
 * @param {string} workDate YYYY-MM-DD
 * @param {Array} [directory] worker_directory rows
 * @returns {Promise<Map<string, object[]>>} worker_name → signals
 */
export async function collectSignalsForWorkDate(
  supabase,
  companyId,
  workDate,
  directory = null
) {
  const { start, end } = getAttendanceSignalQueryRange(workDate);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  let dirRows = directory;
  if (!dirRows) {
    const { data, error } = await supabase
      .from('worker_directory')
      .select('worker_name, display_name')
      .eq('company_id', companyId);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[attendance/signals] directory', error.message);
      dirRows = [];
    } else {
      dirRows = data || [];
    }
  }

  const dirIndex = buildWorkerDirIndex(dirRows);
  const unmatched = [];

  const [fives, goods, defects, lotRows] = await Promise.all([
    fetchSignalRows(supabase, 'fives_reports', companyId, startIso, endIso),
    fetchSignalRows(supabase, 'good_reports', companyId, startIso, endIso),
    fetchSignalRows(supabase, 'defect_reports', companyId, startIso, endIso),
    fetchLotAttendanceSignals(supabase, companyId, startIso, endIso),
  ]);

  /** @type {Map<string, object[]>} */
  const byWorker = new Map();

  const push = (workerName, signal) => {
    const name = String(workerName || '').trim();
    if (!name || !signal?.at) return;
    const list = byWorker.get(name) || [];
    list.push(signal);
    byWorker.set(name, list);
  };

  for (const row of fives) {
    const name = resolveWorkerName(row.worker_name, dirIndex, unmatched);
    if (!name) continue;
    push(name, { type: 'fives', at: row.created_at, sourceId: row.id });
  }
  for (const row of goods) {
    const name = resolveWorkerName(row.worker_name, dirIndex, unmatched);
    if (!name) continue;
    push(name, { type: 'frequent', at: row.created_at, sourceId: row.id });
  }
  for (const row of defects) {
    const name = resolveWorkerName(row.worker_name, dirIndex, unmatched);
    if (!name) continue;
    push(name, { type: 'defect', at: row.created_at, sourceId: row.id });
  }
  for (const row of lotRows) {
    const name = resolveWorkerName(row.worker_name, dirIndex, unmatched);
    if (!name) continue;
    push(name, {
      type: row.type,
      at: row.at,
      sourceId: row.id,
      eventType: row.eventType || null,
    });
  }

  if (unmatched.length) {
    const unique = [...new Set(unmatched)].slice(0, 30);
    // eslint-disable-next-line no-console
    console.warn('[attendance/signals] worker_directory 매칭 실패', {
      workDate,
      count: unique.length,
      samples: unique,
    });
  }

  for (const [name, list] of byWorker) {
    list.sort((a, b) => new Date(a.at) - new Date(b.at));
    byWorker.set(name, list);
  }

  return byWorker;
}

async function fetchSignalRows(supabase, table, companyId, startIso, endIso) {
  const { data, error } = await supabase
    .from(table)
    .select('id, worker_name, created_at')
    .eq('company_id', companyId)
    .or(NOT_DELETED)
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  if (error) {
    // eslint-disable-next-line no-console
    console.error(`[attendance/signals] ${table}`, error.message);
    return [];
  }
  return data || [];
}
