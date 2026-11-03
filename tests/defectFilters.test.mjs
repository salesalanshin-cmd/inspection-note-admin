import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defectLabel } from '../lib/constants.js';
import { filterByCreatedAtDateRange } from '../lib/dateRange.js';
import { filterDefectGallery } from '../lib/defectFilters.js';

const rows = [
  {
    id: 'in-range-item',
    worker_name: '김',
    product_name: '브라켓-1',
    item_id: 'P-100',
    defect_code: 'A001',
    created_at: '2026-08-10T03:00:00.000Z',
  },
  {
    id: 'in-range-other',
    worker_name: '김',
    product_name: '하우징',
    item_id: 'P-200',
    defect_code: 'A002',
    created_at: '2026-08-10T03:00:00.000Z',
  },
  {
    id: 'out-of-range',
    worker_name: '김',
    product_name: '브라켓-1',
    item_id: 'P-100',
    defect_code: 'A001',
    created_at: '2026-07-01T03:00:00.000Z',
  },
];

describe('filterDefectGallery', () => {
  it('기간, 제품명 또는 품번, 불량 유형을 함께 적용한다', () => {
    const dated = filterByCreatedAtDateRange(rows, {
      start: '2026-08-10',
      end: '2026-08-10',
    });
    const byItem = filterDefectGallery(dated, {
      type: '게이트 결육',
      productQuery: 'p-100',
      typeOf: defectLabel,
    });
    assert.deepEqual(byItem.map((row) => row.id), ['in-range-item']);

    const byName = filterDefectGallery(dated, {
      type: 'all',
      productQuery: '브라켓',
      typeOf: defectLabel,
    });
    assert.deepEqual(byName.map((row) => row.id), ['in-range-item']);
  });

  it('검색어가 비어 있으면 제품 조건 없이 유형만 적용한다', () => {
    const filtered = filterDefectGallery(rows, {
      type: '소착',
      productQuery: '  ',
      typeOf: defectLabel,
    });
    assert.deepEqual(filtered.map((row) => row.id), ['in-range-other']);
  });
});