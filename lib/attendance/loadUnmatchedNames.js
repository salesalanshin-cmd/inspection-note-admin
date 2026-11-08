import { fetchAllPages } from './pagedQuery.js';
import { fetchLotAttendanceSignals } from './lotSources.js';
import {
  UNMATCHED_NAME_LOOKBACK_DAYS,
  summarizeUnmatchedNames,
  unmatchedLookbackRange,
} from './unmatchedNames.js';

const NOT_DELETED = 'is_deleted.eq.false,is_deleted.is.null';

const REPORT_TABLES = [
  ['fives_reports', 'fives'],
  ['good_reports', 'frequent'],
  ['defect_reports', 'defect'],
  ['ocr_results', 'document'],
];

async function fetchDirectory(supabase, companyId) {
  const rows = [];
  for (let page = 0; page < 20; page += 1) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from('worker_directory')
      .select('worker_name, display_name, removed, excluded')
      .eq('company_id', companyId)
      .order('worker_name', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < 1000) return rows;
  }
  return rows;
}

async function fetchReportSignals(supabase, companyId, startIso, endIso) {
  const signals = [];
  let truncated = false;
  await Promise.all(REPORT_TABLES.map(async ([table, type]) => {
    const { rows, error, truncated: cut } = await fetchAllPages(
      () => supabase
        .from(table)
        .select('id, worker_name, created_at')
        .eq('company_id', companyId)
        .or(NOT_DELETED)
        .gte('created_at', startIso)
        .lt('created_at', endIso),
      { timeColumn: 'created_at', label: `unmatched/${table}` }
    );
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[attendance/unmatched] ${table}`, error.message);
      return;
    }
    if (cut) truncated = true;
    for (const row of rows) {
      signals.push({
        worker_name: row.worker_name,
        at: row.created_at,
        type,
      });
    }
  }));
  return { signals, truncated };
}

/**
 * 최근 N일 신호를 회사 범위로 읽고 미등록 이름을 집계한다.
 * 판정·저장은 하지 않는다.
 */
export async function loadUnmatchedNameSummary(
  supabase,
  companyId,
  now = new Date(),
  days = UNMATCHED_NAME_LOOKBACK_DAYS
) {
  const range = unmatchedLookbackRange(now, days);
  const startIso = range.start.toISOString();
  const endIso = range.end.toISOString();
  const [directory, reports, lotRows] = await Promise.all([
    fetchDirectory(supabase, companyId),
    fetchReportSignals(supabase, companyId, startIso, endIso),
    fetchLotAttendanceSignals(supabase, companyId, startIso, endIso),
  ]);
  const signals = [
    ...reports.signals,
    ...(lotRows || []).map((row) => ({
      worker_name: row.worker_name,
      at: row.at,
      type: row.type,
    })),
  ];
  return {
    ...summarizeUnmatchedNames({ signals, directory, now, days }),
    truncated: reports.truncated,
  };
}
