import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatAccuracyPercent,
  formatKstWeekRange,
  startOfKstWeek,
  summarizeWeekAccuracy,
  topCorrectionCombos,
  weeklyAccuracyTrend,
} from '../lib/aiAccuracy.js';
import { formatKstISODate } from '../lib/kst.js';

const MONDAY_KST = new Date('2026-11-01T15:00:00.000Z');
const SUNDAY_LATE_KST = new Date('2026-11-01T14:59:59.000Z');
const NEXT_MONDAY_KST = new Date('2026-11-08T15:00:00.000Z');

function judgement(overrides) {
  return {
    code_set: 'defect',
    was_ai_accepted: false,
    ai_suggested_code: 'A001',
    final_code: 'A002',
    product_name: '브라켓',
    created_at: MONDAY_KST.toISOString(),
    ...overrides,
  };
}

describe('KST week boundary', () => {
  it('월요일 00:00 KST가 주의 시작이고 직전 일요일은 이전 주다', () => {
    assert.equal(formatKstISODate(startOfKstWeek(MONDAY_KST)), '2026-11-02');
    assert.equal(formatKstISODate(startOfKstWeek(SUNDAY_LATE_KST)), '2026-10-26');
    assert.equal(formatKstWeekRange(MONDAY_KST), '2026-11-02 – 2026-11-08');
  });

  it('주 시작 직전과 다음 주 시작은 이번 주 집계에 넣지 않는다', () => {
    const rows = [
      judgement({ created_at: SUNDAY_LATE_KST.toISOString() }),
      judgement({ created_at: MONDAY_KST.toISOString(), was_ai_accepted: true, final_code: 'A001' }),
      judgement({ created_at: NEXT_MONDAY_KST.toISOString() }),
    ];
    const summary = summarizeWeekAccuracy(rows, MONDAY_KST);
    assert.equal(summary.length, 1);
    assert.equal(summary[0].judged, 1);
    assert.equal(summary[0].accepted, 1);
    assert.equal(summary[0].corrected, 0);
  });
});

describe('summarizeWeekAccuracy', () => {
  it('수락과 정정을 나누고 오진율 높은 순으로 정렬한다', () => {
    const rows = [
      judgement({ was_ai_accepted: true, final_code: 'A001' }),
      judgement({ was_ai_accepted: false }),
      judgement({ was_ai_accepted: false, ai_suggested_code: 'A003', final_code: 'A004' }),
      judgement({ was_ai_accepted: null }),
      judgement({ code_set: 'sos', was_ai_accepted: false, ai_suggested_code: 'OS01' }),
    ];
    const summary = summarizeWeekAccuracy(rows, MONDAY_KST);
    assert.equal(summary[0].code, 'A003');
    assert.equal(summary[0].corrected, 1);
    assert.equal(summary[0].rate, 1);
    assert.equal(summary[1].code, 'A001');
    assert.equal(summary[1].judged, 2);
    assert.equal(summary[1].accepted, 1);
    assert.equal(summary[1].corrected, 1);
    assert.equal(summary[1].rate, 0.5);
  });

  it('5건 미만은 표본 적음이고 5건은 아니다', () => {
    const four = summarizeWeekAccuracy(
      Array.from({ length: 4 }, () => judgement({ was_ai_accepted: false })),
      MONDAY_KST
    );
    const five = summarizeWeekAccuracy(
      Array.from({ length: 5 }, () => judgement({ was_ai_accepted: true, final_code: 'A001' })),
      MONDAY_KST
    );
    assert.equal(four[0].lowSample, true);
    assert.equal(five[0].lowSample, false);
    assert.equal(five[0].rate, 0);
  });

  it('판정이 0건이면 행이 없고 비율은 나누지 않는다', () => {
    assert.deepEqual(summarizeWeekAccuracy([], MONDAY_KST), []);
    const trend = weeklyAccuracyTrend([], MONDAY_KST, 8);
    assert.equal(trend.length, 8);
    assert.ok(trend.every((point) => point.judged === 0 && point.rate == null));
    assert.equal(formatAccuracyPercent(null), '—');
    assert.equal(formatAccuracyPercent(0), '0%');
    assert.equal(Number.isNaN(trend[0].rate), false);
  });
});

describe('topCorrectionCombos', () => {
  it('정정 조합 건수와 가장 많은 제품명을 고른다', () => {
    const rows = [
      judgement({ product_name: '브라켓' }),
      judgement({ product_name: '브라켓' }),
      judgement({ product_name: '하우징' }),
      judgement({ ai_suggested_code: 'A003', final_code: 'A004', product_name: '' }),
      judgement({ was_ai_accepted: true, final_code: 'A001', product_name: '브라켓' }),
    ];
    const combos = topCorrectionCombos(rows, MONDAY_KST, 5);
    assert.equal(combos[0].aiCode, 'A001');
    assert.equal(combos[0].finalCode, 'A002');
    assert.equal(combos[0].count, 3);
    assert.equal(combos[0].topProduct, '브라켓');
    assert.equal(combos[1].count, 1);
    assert.equal(combos[1].topProduct, null);
  });
});
