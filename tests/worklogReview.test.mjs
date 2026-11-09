import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildReviewedSkipParsedData } from '../lib/worklogReview.js';
import {
  CORRECTION_ADDED,
  CORRECTION_DELETED,
  diffReviewFields,
  isReviewQueueRow,
  qtyAccuracy,
  summarizeReviewCorrections,
} from '../lib/worklogReview.js';

describe('worklog review diff', () => {
  const before = {
    work_date: '2026-09-08',
    item_code: '94500',
    lot_no: '26.09.01 1-1',
    start_time: '08:00',
    end_time: '17:00',
    qty: 100,
    task_note: null,
    process_code: 'IN',
    defect_breakdown: [{ raw_code: 'A10', code: 'A010', qty: 2 }],
  };

  it('바뀐 칸만 corrections 항목으로 만든다', () => {
    const changes = diffReviewFields(before, { ...before, qty: 120, item_code: '94501' });
    assert.deepEqual(changes.map((change) => change.field), ['item_code', 'qty']);
    assert.equal(changes.find((change) => change.field === 'qty').before, 100);
    assert.equal(changes.find((change) => change.field === 'qty').after, 120);
  });

  it('같은 값이면 수정 기록이 없다', () => {
    assert.deepEqual(diffReviewFields(before, { ...before }), []);
  });

  it('추가와 삭제는 정해진 필드 이름을 쓴다', () => {
    assert.equal(CORRECTION_ADDED, '__added__');
    assert.equal(CORRECTION_DELETED, '__deleted__');
  });
});

describe('worklog review accuracy', () => {
  it('수량 정확도는 1에서 수량 수정 행 비율을 뺀 값이다', () => {
    assert.equal(qtyAccuracy(0, 0), null);
    assert.equal(qtyAccuracy(4, 1), 0.75);
  });

  it('검토한 행 안에서만 수정 행과 수량 수정 행을 센다', () => {
    const summary = summarizeReviewCorrections(
      [[
        { row_id: 'a', field: 'qty', before: 1, after: 2 },
        { row_id: 'a', field: 'work_date', before: '2026-09-01', after: '2026-09-02' },
        { row_id: 'b', field: 'item_code', before: '1', after: '2' },
        { row_id: 'c', field: 'qty', before: 3, after: 4 },
        { row_id: 'd', field: CORRECTION_ADDED, before: null, after: {} },
        { row_id: 'e', field: 'defect_breakdown', before: [], after: [{}] },
      ]],
      ['a', 'b', 'e']
    );
    assert.equal(summary.reviewedRows, 3);
    assert.equal(summary.editedRows, 3);
    assert.equal(summary.qtyEditedRows, 1);
    assert.equal(summary.fieldCounts.qty, 2);
    assert.equal(summary.fieldCounts.work_date, 1);
    assert.equal(summary.fieldCounts.item_code, 1);
    assert.equal(summary.fieldCounts.defect_breakdown, 1);
    assert.equal(summary.qtyAccuracy, 1 - 1 / 3);
  });
});

describe('reviewed extract skip', () => {
  it('검토된 사진은 stage를 extract로 두고 건너뛴 이유를 남긴다', () => {
    assert.deepEqual(buildReviewedSkipParsedData({ stage: 'classify', form_type: 'final_inspection' }), {
      stage: 'extract',
      form_type: 'final_inspection',
      skipped_reason: 'reviewed',
    });
  });

  it('검토 대기 행은 중복이 아니고 needs_review인 행이다', () => {
    assert.equal(isReviewQueueRow({ needs_review: true, is_duplicate: false }), true);
    assert.equal(isReviewQueueRow({ needs_review: true, is_duplicate: true }), false);
    assert.equal(isReviewQueueRow({ needs_review: false, is_duplicate: false }), false);
  });
});
