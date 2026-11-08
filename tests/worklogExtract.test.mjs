import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDedupKey,
  buildWorklogInserts,
  matchDefectCode,
  needsReviewForRow,
  resolveProcessCode,
  resolveWorkDate,
} from '../lib/worklogExtract.js';

describe('matchDefectCode', () => {
  it('자릿수가 짧으면 마스터 자리로 맞춘다', () => {
    assert.equal(matchDefectCode('A10'), 'A010');
    assert.equal(matchDefectCode('A010'), 'A010');
    assert.equal(matchDefectCode('GR1'), 'GR001');
  });

  it('O/0 와 l/1 혼동을 보정한 뒤 마스터와 맞춘다', () => {
    assert.equal(matchDefectCode('Mcol'), 'MC001');
    assert.equal(matchDefectCode('mc01'), 'MC001');
  });

  it('마스터에 없으면 null이다', () => {
    assert.equal(matchDefectCode('ZZ9'), null);
    assert.equal(matchDefectCode(''), null);
    assert.equal(matchDefectCode(null), null);
  });
});

describe('work date and process', () => {
  it('촬영 연도를 붙이고 촬영일보다 뒤면 표시한다', () => {
    assert.deepEqual(resolveWorkDate('07-20', '2026-07-24'), {
      workDate: '2026-07-20',
      afterCapture: false,
      invalid: false,
    });
    assert.equal(resolveWorkDate('07-30', '2026-07-24').afterCapture, true);
  });

  it('최종검사는 IN, 공용 양식은 검사만 IN이다', () => {
    assert.deepEqual(resolveProcessCode('final_inspection', null), {
      processCode: 'IN',
      siteNeedsReview: false,
    });
    assert.deepEqual(resolveProcessCode('working_report', '검사'), {
      processCode: 'IN',
      siteNeedsReview: false,
    });
    assert.deepEqual(resolveProcessCode('working_report', null), {
      processCode: null,
      siteNeedsReview: true,
    });
    assert.deepEqual(resolveProcessCode('working_report', '주조'), {
      processCode: null,
      siteNeedsReview: false,
    });
  });
});

describe('saved row', () => {
  it('중복 키에 작업자 이름을 넣지 않고 양품 수량을 good으로 둔다', () => {
    const [row] = buildWorklogInserts({
      parsed: {
        form_type: 'final_inspection',
        sheet_worker: '이미영',
        rows: [
          {
            date: '07-20',
            item_code: '94500',
            lot_no: '26.06.17 1-1',
            start: '08:00',
            end: '17:00',
            qty: 1400,
            task_note: null,
            confidence: 'high',
            defects: [{ raw_code: 'A10', qty: 2 }],
          },
        ],
      },
      capturedYmd: '2026-07-24',
      companyId: 'company-1',
      uploaderName: '진현주',
      ocrResultId: 'ocr-1',
    });
    assert.equal(
      row.dedup_key,
      buildDedupKey({
        companyId: 'company-1',
        formType: 'final_inspection',
        workDate: '2026-07-20',
        itemCode: '94500',
        lotNo: '26.06.17 1-1',
        start: '08:00',
        end: '17:00',
      })
    );
    assert.equal(row.dedup_key.includes('이미영'), false);
    assert.equal(row.qty_kind, 'good');
    assert.equal(row.process_code, 'IN');
    assert.equal(row.sheet_worker, '이미영');
    assert.equal(row.uploader_name, '진현주');
    assert.deepEqual(row.defect_breakdown, [{ raw_code: 'A10', code: 'A010', qty: 2 }]);
    assert.equal(row.defect_qty, 2);
    assert.equal(row.needs_review, false);
  });

  it('수량이 없고 메모도 없거나 날짜가 뒤면 확인이 필요하다', () => {
    assert.equal(
      needsReviewForRow({
        confidence: 'high',
        qty: null,
        taskNote: null,
        afterCapture: false,
        invalidDate: false,
        siteNeedsReview: false,
        qtyConflict: false,
      }),
      true
    );
    assert.equal(
      needsReviewForRow({
        confidence: 'high',
        qty: null,
        taskNote: '선별',
        afterCapture: false,
        invalidDate: false,
        siteNeedsReview: false,
        qtyConflict: false,
      }),
      false
    );
  });
});
