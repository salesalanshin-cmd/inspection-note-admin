import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatMisdiagnosisAlertBody,
  planMisdiagnosisAlerts,
  shouldNotifyMisdiagnosis,
} from '../lib/misdiagnosisAlerts.js';

const NOW = new Date('2026-08-31T00:00:00.000Z');
const COMPANY = 'company-1';

function row(overrides = {}) {
  return {
    company_id: COMPANY,
    code_set: 'defect',
    product_name: '브라켓',
    ai_suggested_code: 'A001',
    final_code: 'A002',
    was_ai_accepted: false,
    created_at: '2026-08-20T00:00:00.000Z',
    ...overrides,
  };
}

function repeat(count, overrides) {
  return Array.from({ length: count }, () => row(overrides));
}

function plan(rows, alerts = []) {
  return planMisdiagnosisAlerts(rows, alerts, { now: NOW, windowDays: 30, threshold: 3 });
}

function notified(rows, alerts) {
  return plan(rows, alerts).filter((item) => item.notify);
}

describe('shouldNotifyMisdiagnosis', () => {
  it('2회는 알리지 않고 3회는 알린다', () => {
    assert.equal(shouldNotifyMisdiagnosis(2, 0, 3), false);
    assert.equal(shouldNotifyMisdiagnosis(3, 0, 3), true);
  });

  it('알린 뒤 4~5회는 다시 알리지 않고 6회는 알린다', () => {
    assert.equal(shouldNotifyMisdiagnosis(4, 3, 3), false);
    assert.equal(shouldNotifyMisdiagnosis(5, 3, 3), false);
    assert.equal(shouldNotifyMisdiagnosis(6, 3, 3), true);
  });
});

describe('planMisdiagnosisAlerts', () => {
  it('2회는 알림 없음, 3회는 알림', () => {
    assert.equal(notified(repeat(2)).length, 0);
    const hits = notified(repeat(3));
    assert.equal(hits.length, 1);
    assert.equal(hits[0].count, 3);
    assert.equal(hits[0].product_name, '브라켓');
  });

  it('이미 3회에 알렸으면 4~5회는 재알림 없고 6회는 재알림', () => {
    const alert = {
      company_id: COMPANY,
      code_set: 'defect',
      product_name: '브라켓',
      ai_suggested_code: 'A001',
      final_code: 'A002',
      last_notified_count: 3,
    };
    assert.equal(notified(repeat(4), [alert]).length, 0);
    assert.equal(notified(repeat(5), [alert]).length, 0);
    assert.equal(notified(repeat(6), [alert]).length, 1);
  });

  it('수락 건과 제품명 없는 건은 횟수에서 빠진다', () => {
    const rows = [
      ...repeat(2),
      row({ was_ai_accepted: true }),
      row({ was_ai_accepted: null }),
      row({ product_name: '' }),
      row({ product_name: '   ' }),
      row({ product_name: null }),
    ];
    assert.equal(notified(rows).length, 0);
    assert.equal(plan(rows)[0].count, 2);
  });

  it('30일보다 오래된 정정은 세지 않는다', () => {
    const rows = [
      ...repeat(2),
      row({ created_at: '2026-07-31T23:59:59.000Z' }),
      row({ created_at: '2026-08-01T00:00:00.000Z' }),
    ];
    const hits = plan(rows);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].count, 3);
    assert.equal(hits[0].notify, true);

    const onlyOld = plan([
      row({ created_at: '2026-07-01T00:00:00.000Z' }),
      row({ created_at: '2026-07-02T00:00:00.000Z' }),
      row({ created_at: '2026-07-03T00:00:00.000Z' }),
    ]);
    assert.equal(onlyOld.length, 0);
  });

  it('코드가 같으면 정정으로 세지 않는다', () => {
    assert.equal(notified(repeat(3, { final_code: 'A001' })).length, 0);
  });
});

describe('formatMisdiagnosisAlertBody', () => {
  it('코드 라벨과 기간을 문구에 넣는다', () => {
    const body = formatMisdiagnosisAlertBody(
      {
        code_set: 'defect',
        product_name: '브라켓',
        ai_suggested_code: 'A001',
        final_code: 'A002',
        count: 3,
      },
      30
    );
    assert.equal(body, '반복 오진: 브라켓 AI 게이트 결육 → 사용자 소착 정정 3회 (최근 30일)');
  });
});
