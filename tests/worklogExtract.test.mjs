import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EXTRACT_PROMPT_VERSION, EXTRACT_SYSTEM_PROMPT, normalizeFormEvidence } from '../lib/ocrExtract.js';
import { isAnthropicBillingStop } from '../lib/worklogExtractJob.js';
import {
  buildDedupKey,
  buildWorklogInserts,
  docTypeForForm,
  matchDefectCode,
  matchRatio,
  needsReviewForRow,
  planWorklogDedup,
  resolveProcessCode,
  resolveWorkDate,
  signatureMultiset,
  SUPERSEDE_WINDOW_MS,
  withinSupersedeWindow,
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

  it('최종검사는 IN, 공용 양식은 site·작업자로 공정을 판별한다', () => {
    assert.deepEqual(resolveProcessCode('final_inspection', null), {
      processCode: 'IN',
      siteNeedsReview: false,
      processInferred: null,
    });
    assert.deepEqual(resolveProcessCode('working_report', '검사'), {
      processCode: 'IN',
      siteNeedsReview: false,
      processInferred: null,
    });
    assert.deepEqual(resolveProcessCode('working_report', '주조'), {
      processCode: '주조',
      siteNeedsReview: false,
      processInferred: null,
    });
    assert.deepEqual(resolveProcessCode('working_report', null), {
      processCode: null,
      siteNeedsReview: true,
      processInferred: null,
    });
    assert.deepEqual(
      resolveProcessCode('working_report', '불트갭', {
        matchedWorkers: [{ raw: '이미영', name: '이미영', process: '검사' }],
      }),
      { processCode: 'IN', siteNeedsReview: false, processInferred: 'worker' }
    );
    assert.deepEqual(
      resolveProcessCode('working_report', null, {
        matchedWorkers: [],
        uploaderMatch: { raw: '염애화', name: '염애화', process: '검사' },
      }),
      { processCode: 'IN', siteNeedsReview: false, processInferred: 'uploader' }
    );
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
    assert.equal(row.raw.form_evidence, null);
  });

  it('판별 근거를 행 raw에 함께 넣는다', () => {
    const evidence = "제목 '최종 검사 작업일보', 수량칸 '양품수량'";
    const [row] = buildWorklogInserts({
      parsed: {
        form_type: 'final_inspection',
        form_evidence: evidence,
        rows: [{ date: '07-20', item_code: '94500', qty: 10, confidence: 'high' }],
      },
      capturedYmd: '2026-07-24',
      companyId: 'company-1',
      uploaderName: '진현주',
      ocrResultId: 'ocr-1',
    });
    assert.equal(row.raw.form_evidence, evidence);
    assert.equal(row.raw.item_code, '94500');
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

describe('extract prompt', () => {
  it('프롬프트 버전은 3이고 수량 칸 제목으로 양식을 가른다', () => {
    assert.equal(EXTRACT_PROMPT_VERSION, 3);
    assert.match(EXTRACT_SYSTEM_PROMPT, /양품수량.*final_inspection/);
    assert.match(EXTRACT_SYSTEM_PROMPT, /작업수량.*final_inspection이 아니다/);
    assert.match(EXTRACT_SYSTEM_PROMPT, /둘 다 보이지 않으면 form_type은 other/);
    assert.match(EXTRACT_SYSTEM_PROMPT, /form_evidence/);
    assert.equal(
      normalizeFormEvidence("  제목 '최종 검사 작업일보',  수량칸 '양품수량'  "),
      "제목 '최종 검사 작업일보', 수량칸 '양품수량'"
    );
    assert.equal(normalizeFormEvidence('   '), null);
    assert.equal(normalizeFormEvidence(null), null);
  });
});

describe('paper supersede', () => {
  const later = '2026-07-24T10:00:00.000Z';
  const earlier = new Date(Date.parse(later) - SUPERSEDE_WINDOW_MS).toISOString();

  it('양식에 맞춰 문서 유형을 채운다', () => {
    assert.equal(docTypeForForm('final_inspection'), 'worklog');
    assert.equal(docTypeForForm('casting_detail'), 'worklog');
    assert.equal(docTypeForForm('self_check'), 'inspection');
    assert.equal(docTypeForForm('other'), 'other');
    assert.equal(docTypeForForm('unknown'), null);
  });

  it('수량 멀티셋은 같은 날짜·수량을 개수대로 센다', () => {
    const counts = signatureMultiset([
      { work_date: '2026-07-20', qty: 10 },
      { work_date: '2026-07-20', qty: '10' },
      { work_date: '2026-07-20', qty: null },
      { work_date: '2026-07-21', qty: 5 },
    ]);
    assert.equal(matchRatio(counts, counts), 1);
    assert.equal(
      matchRatio(counts, signatureMultiset([{ work_date: '2026-07-20', qty: 10 }])),
      1 / 3
    );
  });

  it('나중에 찍힌 사진 중 가장 최근 것과 겹치는 날짜만 대체한다', () => {
    const keep = { id: 'q-keep', work_date: '2026-07-21', qty: 5 };
    const drop = { id: 'q-drop', work_date: '2026-07-20', qty: 10 };
    const blank = { id: 'q-blank', work_date: '2026-07-20', qty: null };
    const middle = new Date(Date.parse(earlier) + 24 * 60 * 60 * 1000).toISOString();
    const plan = planWorklogDedup([
      {
        id: 'newer',
        formType: 'final_inspection',
        capturedAt: later,
        rows: [
          { id: 'n1', work_date: '2026-07-20', qty: 10 },
          { id: 'n2', work_date: '2026-08-01', qty: 9 },
        ],
      },
      {
        id: 'older',
        formType: 'final_inspection',
        capturedAt: earlier,
        rows: [drop, keep, blank],
      },
      {
        id: 'middle',
        formType: 'final_inspection',
        capturedAt: middle,
        rows: [{ id: 'm1', work_date: '2026-07-20', qty: 10 }],
      },
      {
        id: 'too-old',
        formType: 'final_inspection',
        capturedAt: new Date(Date.parse(later) - SUPERSEDE_WINDOW_MS - 1000).toISOString(),
        rows: [{ id: 'old', work_date: '2026-07-20', qty: 999 }],
      },
      {
        id: 'other-form',
        formType: 'working_report',
        capturedAt: earlier,
        rows: [{ id: 'w1', work_date: '2026-07-20', qty: 10 }],
      },
    ]);
    assert.equal(plan.supersededPhotos, 2);
    assert.deepEqual(
      plan.marks.map((mark) => [mark.id, mark.supersededBy]),
      [
        ['q-drop', 'newer'],
        ['q-blank', 'newer'],
        ['m1', 'newer'],
      ]
    );
    assert.equal(withinSupersedeWindow(earlier, later), true);
    assert.equal(withinSupersedeWindow(later, earlier), false);
  });

  it('겹침이 절반보다 적으면 대체하지 않는다', () => {
    const plan = planWorklogDedup([
      {
        id: 'older',
        formType: 'final_inspection',
        capturedAt: earlier,
        rows: [
          { id: 'a', work_date: '2026-07-20', qty: 10 },
          { id: 'b', work_date: '2026-07-21', qty: 5 },
          { id: 'c', work_date: '2026-07-22', qty: 7 },
        ],
      },
      {
        id: 'newer',
        formType: 'final_inspection',
        capturedAt: later,
        rows: [{ id: 'n', work_date: '2026-07-20', qty: 10 }],
      },
    ]);
    assert.equal(plan.supersededPhotos, 0);
    assert.deepEqual(plan.marks, []);
  });
});

describe('isAnthropicBillingStop', () => {
  it('크레딧 부족과 요금 제한만 멈춤으로 본다', () => {
    assert.equal(isAnthropicBillingStop({ status: 429, message: 'slow down' }), true);
    assert.equal(isAnthropicBillingStop({ status: 402, message: 'payment required' }), true);
    assert.equal(isAnthropicBillingStop({ error: { type: 'rate_limit_error' } }), true);
    assert.equal(isAnthropicBillingStop({ error: { error: { type: 'billing_error' } } }), true);
    assert.equal(
      isAnthropicBillingStop({ status: 400, message: 'Your credit balance is too low to access the Anthropic API.' }),
      true,
    );
    assert.equal(isAnthropicBillingStop({ status: 400, message: 'invalid image' }), false);
    assert.equal(isAnthropicBillingStop({ status: 529, message: 'overloaded' }), false);
  });
});
