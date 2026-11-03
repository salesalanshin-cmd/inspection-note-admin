/** 근태 원천 조회 페이지 크기. PostgREST 기본 max-rows(1000)와 같게 맞춘다. */
export const ATTENDANCE_PAGE_SIZE = 1000;

/** 원천 하나당 최대 페이지 수. 넘으면 모은 행만 쓰고 console.warn. */
export const ATTENDANCE_MAX_PAGES = 20;

/**
 * 필터가 적용된 쿼리를 시각 + id 오름차순으로 1000행씩 읽는다.
 * buildQuery는 호출마다 새 쿼리를 반환해야 한다. order/range는 여기서 붙인다.
 *
 * @param {() => { order: Function, range: Function }} buildQuery
 * @param {{ timeColumn: string, label: string, maxPages?: number, pageSize?: number }} opts
 * @returns {Promise<{ rows: object[], error: { message?: string }|null, truncated: boolean }>}
 */
export async function fetchAllPages(
  buildQuery,
  {
    timeColumn,
    label,
    maxPages = ATTENDANCE_MAX_PAGES,
    pageSize = ATTENDANCE_PAGE_SIZE,
  }
) {
  const rows = [];
  const seen = new Set();

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery()
      .order(timeColumn, { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      return { rows: [], error, truncated: false };
    }

    const batch = data || [];
    for (const row of batch) {
      const id = row?.id;
      if (id != null) {
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      rows.push(row);
    }

    if (batch.length < pageSize) {
      return { rows, error: null, truncated: false };
    }
  }

  // eslint-disable-next-line no-console
  console.warn(
    `[attendance/pages] ${label} 조회가 페이지 상한(${maxPages})에 도달했습니다. 이후 행은 빠졌을 수 있습니다.`,
    { fetched: rows.length }
  );
  return { rows, error: null, truncated: true };
}
