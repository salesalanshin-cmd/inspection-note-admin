import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LIST_MAX_PAGES,
  LIST_PAGE_SIZE,
  appendListPage,
  emptyListPageState,
  readSortedPages,
} from '../lib/listPages.js';

function row(i, second) {
  return {
    id: `id-${String(i).padStart(4, '0')}`,
    created_at: new Date(Date.UTC(2026, 9, 21, 0, 0, second)).toISOString(),
  };
}

function byCreatedAtDescThenId(a, b) {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

describe('readSortedPages', () => {
  it('2500행을 1000행씩 모두 가져오고 중복이 없다', () => {
    const rows = Array.from({ length: 2500 }, (_, i) => row(i, Math.floor(i / 2)));
    rows.sort(byCreatedAtDescThenId);
    for (let i = rows.length - 1; i > 0; i -= 1) {
      const j = (i * 17) % (i + 1);
      const tmp = rows[i];
      rows[i] = rows[j];
      rows[j] = tmp;
    }
    rows.sort(byCreatedAtDescThenId);

    const { rows: fetched, truncated, pages } = readSortedPages(rows);

    assert.equal(truncated, false);
    assert.equal(pages, 3);
    assert.equal(LIST_PAGE_SIZE, 1000);
    assert.equal(fetched.length, 2500);
    assert.equal(new Set(fetched.map((item) => item.id)).size, 2500);
    for (let i = 1; i < fetched.length; i += 1) {
      assert.equal(byCreatedAtDescThenId(fetched[i - 1], fetched[i]) <= 0, true);
    }
  });

  it('페이지 상한에 닿으면 그 페이지까지만 반환하고 잘림으로 표시한다', () => {
    const rows = Array.from({ length: 2500 }, (_, i) => row(i, 2500 - i));
    rows.sort(byCreatedAtDescThenId);
    const { rows: fetched, truncated, pages } = readSortedPages(rows, {
      pageSize: LIST_PAGE_SIZE,
      maxPages: 2,
    });
    assert.equal(LIST_MAX_PAGES, 20);
    assert.equal(truncated, true);
    assert.equal(pages, 2);
    assert.equal(fetched.length, 2000);
    assert.equal(new Set(fetched.map((item) => item.id)).size, 2000);
    assert.equal(fetched[0].id, rows[0].id);
    assert.equal(fetched[1999].id, rows[1999].id);
  });

  it('페이지 경계에 같은 id가 다시 오면 한 번만 남긴다', () => {
    const first = [row(1, 10), row(2, 9)];
    const overlap = [row(2, 9), row(3, 8)];
    let state = appendListPage(emptyListPageState(), first, { pageSize: 2, maxPages: 5 });
    state = appendListPage(state, overlap, { pageSize: 2, maxPages: 5 });
    assert.deepEqual(
      state.rows.map((item) => item.id),
      ['id-0001', 'id-0002', 'id-0003']
    );
  });
});
