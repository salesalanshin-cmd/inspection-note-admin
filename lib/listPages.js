/** 목록 조회 페이지 크기. PostgREST 기본 max-rows(1000)와 같게 맞춘다. */
export const LIST_PAGE_SIZE = 1000;

/** 목록 하나당 최대 페이지 수. 넘으면 모은 행만 쓰고 잘림으로 표시한다. */
export const LIST_MAX_PAGES = 20;

export const LIST_TRUNCATION_MESSAGE = '일부 오래된 기록이 생략되었을 수 있음';

export function emptyListPageState() {
  return { rows: [], seen: [], page: 0, truncated: false, done: false };
}

/**
 * 한 페이지를 누적한다. 같은 id는 한 번만 남긴다.
 * 가득 찬 페이지가 상한에 닿으면 truncated.
 * @param {{ rows: object[], seen: string[], page: number, truncated: boolean, done: boolean }} state
 * @param {object[]} batch
 * @param {{ pageSize?: number, maxPages?: number }} [opts]
 */
export function appendListPage(state, batch, opts = {}) {
  const pageSize = opts.pageSize ?? LIST_PAGE_SIZE;
  const maxPages = opts.maxPages ?? LIST_MAX_PAGES;
  const seen = new Set(state.seen);
  const rows = state.rows.slice();
  for (const row of batch || []) {
    const id = row?.id;
    if (id != null) {
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
    }
    rows.push(row);
  }
  const page = state.page + 1;
  const full = (batch || []).length >= pageSize;
  const truncated = Boolean(full && page >= maxPages);
  return {
    rows,
    seen: [...seen],
    page,
    truncated,
    done: !full || truncated,
  };
}

/**
 * 이미 정렬된 배열을 페이지 크기만큼 잘라 읽는다.
 * 서버가 created_at + id 로 정렬해 준 결과와 같은 순서를 가정한다.
 * @param {object[]} sortedRows
 * @param {{ pageSize?: number, maxPages?: number }} [opts]
 */
export function readSortedPages(sortedRows, opts = {}) {
  const pageSize = opts.pageSize ?? LIST_PAGE_SIZE;
  let state = emptyListPageState();
  while (!state.done) {
    const from = state.page * pageSize;
    const batch = (sortedRows || []).slice(from, from + pageSize);
    state = appendListPage(state, batch, opts);
  }
  return { rows: state.rows, truncated: state.truncated, pages: state.page };
}

/**
 * 필터가 끝난 쿼리를 시각 desc, id asc 로 1000행씩 읽는다.
 * buildQuery는 호출마다 새 쿼리를 반환해야 한다. order/range는 여기서 붙인다.
 * 근태용 fetchAllPages(오름차순)와 분리한다.
 *
 * @param {() => { order: Function, range: Function }} buildQuery
 * @param {{ timeColumn: string, label: string, ascending?: boolean, maxPages?: number, pageSize?: number }} opts
 */
export async function fetchListPages(
  buildQuery,
  {
    timeColumn,
    label,
    ascending = false,
    maxPages = LIST_MAX_PAGES,
    pageSize = LIST_PAGE_SIZE,
  }
) {
  let state = emptyListPageState();
  while (!state.done) {
    const from = state.page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery()
      .order(timeColumn, { ascending })
      .order('id', { ascending: true })
      .range(from, to);
    if (error) {
      return { rows: [], error, truncated: false };
    }
    state = appendListPage(state, data || [], { pageSize, maxPages });
  }
  if (state.truncated) {
    // eslint-disable-next-line no-console
    console.warn(
      `[lists/pages] ${label} 조회가 페이지 상한(${maxPages})에 도달했습니다. 이후 행은 빠졌을 수 있습니다.`,
      { fetched: state.rows.length }
    );
  }
  return { rows: state.rows, error: null, truncated: state.truncated };
}
