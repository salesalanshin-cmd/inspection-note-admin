import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  aggregateSimilarCorrections,
  correctionLogExtras,
  formatCorrectionExampleLine,
  selectPastCorrectionExamples,
} from '../lib/aiCorrectionSelect.js';

describe('selectPastCorrectionExamples', () => {
  it('같은 제품 정정, 사유 있는 정정, 나머지 정정, 수락 소수 순으로 고르고 중복을 뺀다', () => {
    const rows = [
      {
        source_id: 'same-new',
        product_name: '브라켓',
        ai_suggested_code: 'A001',
        final_code: 'A002',
        was_ai_accepted: false,
        created_at: '2026-08-02T00:00:00.000Z',
      },
      {
        source_id: 'same-new',
        product_name: '브라켓',
        ai_suggested_code: 'A003',
        final_code: 'A004',
        was_ai_accepted: false,
        created_at: '2026-08-01T00:00:00.000Z',
      },
      {
        source_id: 'dup-lesson',
        product_name: '브라켓',
        ai_suggested_code: 'A001',
        final_code: 'A002',
        was_ai_accepted: false,
        created_at: '2026-08-03T00:00:00.000Z',
      },
      {
        source_id: 'reason',
        product_name: '다른제품',
        ai_suggested_code: 'A010',
        final_code: 'A011',
        correction_reason: '표면 무늬',
        was_ai_accepted: false,
      },
      {
        source_id: 'other',
        product_name: '다른제품',
        ai_suggested_code: 'A020',
        final_code: 'A021',
        was_ai_accepted: false,
      },
      {
        source_id: 'accepted-same',
        product_name: '브라켓',
        ai_suggested_code: 'A030',
        final_code: 'A030',
        was_ai_accepted: true,
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        source_id: `accepted-${index}`,
        product_name: '기타',
        ai_suggested_code: `B${index}`,
        final_code: `B${index}`,
        was_ai_accepted: true,
      })),
    ];

    const picked = selectPastCorrectionExamples(rows, { productName: '브라켓' });
    assert.deepEqual(
      picked.map((row) => row.source_id),
      ['same-new', 'reason', 'other', 'accepted-same', 'accepted-0', 'accepted-1', 'accepted-2', 'accepted-3']
    );
  });

  it('정정이 30건을 넘으면 수락은 5건만 남겨 합계 30건이다', () => {
    const corrections = Array.from({ length: 40 }, (_, index) => ({
      source_id: `c-${index}`,
      product_name: '브라켓',
      ai_suggested_code: 'A001',
      final_code: `F${index}`,
      was_ai_accepted: false,
    }));
    const accepted = Array.from({ length: 8 }, (_, index) => ({
      source_id: `a-${index}`,
      ai_suggested_code: `S${index}`,
      final_code: `S${index}`,
      was_ai_accepted: true,
    }));
    const picked = selectPastCorrectionExamples([...corrections, ...accepted], {
      productName: '브라켓',
    });
    assert.equal(picked.length, 30);
    assert.equal(picked.filter((row) => row.was_ai_accepted === true).length, 5);
    assert.equal(picked[0].source_id, 'c-0');
  });
});

describe('aggregateSimilarCorrections', () => {
  it('같은 AI 코드의 거절만 final_code별 상위 2개로 집계한다', () => {
    const rows = [
      {
        ai_suggested_code: 'A001',
        final_code: 'A002',
        product_name: '브라켓',
        was_ai_accepted: false,
        created_at: '2026-08-01T00:00:00.000Z',
      },
      {
        ai_suggested_code: 'A001',
        final_code: 'A002',
        product_name: '다른제품',
        was_ai_accepted: false,
        created_at: '2026-08-03T00:00:00.000Z',
      },
      {
        ai_suggested_code: 'A001',
        final_code: 'A003',
        product_name: '브라켓',
        was_ai_accepted: false,
        created_at: '2026-08-02T00:00:00.000Z',
      },
      {
        ai_suggested_code: 'A009',
        final_code: 'A002',
        product_name: '브라켓',
        was_ai_accepted: false,
        created_at: '2026-08-04T00:00:00.000Z',
      },
      {
        ai_suggested_code: 'A001',
        final_code: 'A004',
        product_name: '브라켓',
        was_ai_accepted: true,
        created_at: '2026-08-05T00:00:00.000Z',
      },
    ];
    const summary = aggregateSimilarCorrections(rows, {
      code: 'A001',
      productName: '브라켓',
    });
    assert.deepEqual(summary, [
      {
        finalCode: 'A002',
        count: 2,
        sameProductCount: 1,
        lastCorrectedAt: '2026-08-03T00:00:00.000Z',
      },
      {
        finalCode: 'A003',
        count: 1,
        sameProductCount: 1,
        lastCorrectedAt: '2026-08-02T00:00:00.000Z',
      },
    ]);
  });

  it('코드가 없으면 빈 배열이다', () => {
    assert.deepEqual(aggregateSimilarCorrections([{ final_code: 'A002' }], { code: null }), []);
  });
});

describe('correctionLogExtras', () => {
  it('값이 있는 항목만 넣고 빈 값은 키를 생략한다', () => {
    const extras = correctionLogExtras({
      correctedBy: '  ',
      productName: '브라켓',
      itemId: '',
      aiRunAt: new Date('2026-08-01T01:02:03.000Z'),
    });
    assert.deepEqual(extras, {
      product_name: '브라켓',
      ai_run_at: '2026-08-01T01:02:03.000Z',
    });
    assert.equal('corrected_by' in extras, false);
    assert.equal('item_id' in extras, false);
  });
});

describe('formatCorrectionExampleLine', () => {
  it('제품명과 정정 사유를 사례 문장에 포함한다', () => {
    const line = formatCorrectionExampleLine(
      {
        product_name: '브라켓',
        ai_suggested_code: 'A001',
        final_code: 'A002',
        was_ai_accepted: false,
        correction_reason: '표면 무늬',
      },
      (code) => code
    );
    assert.equal(
      line,
      '- [제품 브라켓] AI가 A001로 잘못 판단했으나 실제로는 A002였음 - 이유: 표면 무늬'
    );
  });
});

describe('classify prompt', () => {
  it('정정 우선 지시를 넣고 응답 형식은 유지한다', () => {
    const source = readFileSync(new URL('../lib/classifyPrompt.js', import.meta.url), 'utf8');
    assert.match(source, /사용자가 정정한 사례는 AI의 기존 판단보다 우선한다/);
    assert.match(
      source,
      /같은 제품에서 과거에 정정된 유형과 비슷한 사진이면 정정된 코드를 우선 고려하라/
    );
    assert.match(source, /"code": "코드값 또는 null"/);
    assert.match(source, /"confidence": "high" \| "medium" \| "low"/);
    assert.match(source, /"reason": "한글 설명"/);
  });
});
