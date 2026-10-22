import { getWorkRangeBounds } from '../analytics.js';
import { summarizeSignals } from './signalUtils.js';

export { summarizeSignals };

/**
 * 출근 신호 합집합 (OR).
 * 소스: 3정5S / 자주검사(양품+불량) / LOT(확장 테이블)
 */

const NOT_DELETED = 'is_deleted.eq.false,is_deleted.is.null';

/**
 * @param {object} supabase
 * @param {string} companyId
 * @param {string} workDate YYYY-MM-DD
 * @returns {Promise<Map<string, AttendanceSignal[]>>} worker_name → signals
 */
export async function collectSignalsForWorkDate(supabase, companyId, workDate) {
  const { start, end } = getWorkRangeBounds(workDate);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [fives, goods, defects, lots] = await Promise.all([
    fetchSignalRows(supabase, 'fives_reports', companyId, startIso, endIso),
    fetchSignalRows(supabase, 'good_reports', companyId, startIso, endIso),
    fetchSignalRows(supabase, 'defect_reports', companyId, startIso, endIso),
    fetchLotSignalRows(supabase, companyId, startIso, endIso),
  ]);

  /** @type {Map<string, AttendanceSignal[]>} */
  const byWorker = new Map();

  const push = (workerName, signal) => {
    const name = String(workerName || '').trim();
    if (!name || !signal?.at) return;
    const list = byWorker.get(name) || [];
    list.push(signal);
    byWorker.set(name, list);
  };

  for (const row of fives) {
    push(row.worker_name, {
      type: 'fives',
      at: row.created_at,
      sourceId: row.id,
    });
  }
  for (const row of goods) {
    push(row.worker_name, {
      type: 'frequent',
      at: row.created_at,
      sourceId: row.id,
    });
  }
  for (const row of defects) {
    push(row.worker_name, {
      type: 'defect',
      at: row.created_at,
      sourceId: row.id,
    });
  }
  for (const row of lots) {
    push(row.worker_name, {
      type: 'lot',
      at: row.created_at,
      sourceId: row.id,
      eventType: row.event_type || null,
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

/** LOT 확장 — 테이블 없거나 비어 있으면 [] */
async function fetchLotSignalRows(supabase, companyId, startIso, endIso) {
  const { data, error } = await supabase
    .from('lot_activity_events')
    .select('id, worker_name, created_at, event_type')
    .eq('company_id', companyId)
    .or(NOT_DELETED)
    .gte('created_at', startIso)
    .lt('created_at', endIso);
  if (error) {
    // 미적용 마이그레이션 등 — 조용히 스킵
    // eslint-disable-next-line no-console
    console.warn('[attendance/signals] lot_activity_events', error.message);
    return [];
  }
  return data || [];
}
