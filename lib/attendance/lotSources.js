/**
 * 앱(Supabase) LOT 신호 소스
 * - lot_moves: 위치 이동 (occurred_at, worker_name, company_id)
 * - production_events: 실적 착수/종료/취소 (occurred_at, worker_name; company_id 없을 수 있음)
 *
 * lot_activity_events 는 보조 적재용. 본 모듈이 확장점 본체.
 */

/**
 * @param {object} supabase
 * @param {string} companyId
 * @param {string} startIso
 * @param {string} endIso
 * @returns {Promise<Array<{ id: string, worker_name: string, at: string, type: 'lot_move'|'production', eventType?: string }>>}
 */
export async function fetchLotAttendanceSignals(
  supabase,
  companyId,
  startIso,
  endIso
) {
  const [moves, productions, legacy] = await Promise.all([
    fetchLotMoves(supabase, companyId, startIso, endIso),
    fetchProductionEvents(supabase, companyId, startIso, endIso),
    fetchLegacyLotActivity(supabase, companyId, startIso, endIso),
  ]);

  return [...moves, ...productions, ...legacy];
}

async function fetchLotMoves(supabase, companyId, startIso, endIso) {
  const { data, error } = await supabase
    .from('lot_moves')
    .select('id, worker_name, occurred_at, cancels_move_id')
    .eq('company_id', companyId)
    .gte('occurred_at', startIso)
    .lt('occurred_at', endIso);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[attendance/lot] lot_moves', error.message);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    worker_name: row.worker_name,
    at: row.occurred_at,
    type: 'lot_move',
    eventType: row.cancels_move_id ? 'cancel_move' : 'move',
  }));
}

/**
 * production_events: company_id 컬럼이 있으면 필터, 없으면 시간 범위만.
 * (앱 insert 페이로드에 company_id 없음 — 테넌트 격리는 작업자 디렉터리 매칭으로 보강)
 */
async function fetchProductionEvents(supabase, companyId, startIso, endIso) {
  const withCompany = await supabase
    .from('production_events')
    .select('id, worker_name, occurred_at, event_type, company_id')
    .eq('company_id', companyId)
    .gte('occurred_at', startIso)
    .lt('occurred_at', endIso);

  if (!withCompany.error) {
    return mapProductionRows(withCompany.data);
  }

  const { data, error } = await supabase
    .from('production_events')
    .select('id, worker_name, occurred_at, event_type')
    .gte('occurred_at', startIso)
    .lt('occurred_at', endIso);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[attendance/lot] production_events', error.message);
    return [];
  }
  return mapProductionRows(data);
}

function mapProductionRows(data) {
  return (data || []).map((row) => ({
    id: row.id,
    worker_name: row.worker_name,
    at: row.occurred_at,
    type: 'production',
    eventType: row.event_type || null,
  }));
}

/** 028 확장 테이블에 수동/연동 적재된 행 */
async function fetchLegacyLotActivity(supabase, companyId, startIso, endIso) {
  const { data, error } = await supabase
    .from('lot_activity_events')
    .select('id, worker_name, created_at, event_type, meta')
    .eq('company_id', companyId)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .gte('created_at', startIso)
    .lt('created_at', endIso);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[attendance/lot] lot_activity_events', error.message);
    return [];
  }

  return (data || []).map((row) => {
    const hint = String(
      row.meta?.signal_type || row.event_type || 'lot_move'
    ).toLowerCase();
    const type =
      hint.includes('production') || hint.includes('실적')
        ? 'production'
        : 'lot_move';
    return {
      id: row.id,
      worker_name: row.worker_name,
      at: row.created_at,
      type,
      eventType: row.event_type || null,
    };
  });
}

/**
 * worker_directory 기준 정규화. 실패 시 null + unmatched 목록에 기록.
 */
export function resolveWorkerName(rawName, dirIndex, unmatchedOut) {
  const raw = String(rawName || '').trim();
  if (!raw) {
    unmatchedOut.push('(empty)');
    return null;
  }
  if (dirIndex.byName.has(raw)) return raw;
  const viaDisplay = dirIndex.byDisplay.get(raw);
  if (viaDisplay) return viaDisplay;
  unmatchedOut.push(raw);
  return null;
}

export function buildWorkerDirIndex(directory) {
  const byName = new Set();
  const byDisplay = new Map();
  for (const row of directory || []) {
    const name = String(row.worker_name || '').trim();
    if (!name) continue;
    byName.add(name);
    const display = String(row.display_name || '').trim();
    if (display && display !== name) {
      byDisplay.set(display, name);
    }
  }
  return { byName, byDisplay };
}
