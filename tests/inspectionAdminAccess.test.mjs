import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inspectionTime, lotOverlapsRound, roundInterval } from '../lib/inspection/rounds.js';
import {
  assertUpdatedRow,
  pickInspectionItemInsert,
  pickInspectionItemPatch,
  summarizeInspectionHeader,
} from '../lib/inspection/adminAccess.js';

const COMPANY = 'company-1';

describe('inspection admin access', () => {
  it('허용 필드만 patch 로 남기고 company_id 불일치는 거절한다', () => {
    const ok = pickInspectionItemPatch(
      { title: '습동유', sort_order: 2, is_active: true },
      COMPANY
    );
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.patch, { title: '습동유', sort_order: 2, is_active: true });

    const badField = pickInspectionItemPatch({ secret: 1 }, COMPANY);
    assert.equal(badField.ok, false);
    assert.match(badField.error, /허용되지 않은 필드/);

    const badCompany = pickInspectionItemPatch(
      { title: '습동유', company_id: 'other' },
      COMPANY
    );
    assert.equal(badCompany.ok, false);
    assert.match(badCompany.error, /company_id/);
  });

  it('insert 도 화이트리스트·kind·item_no 를 검증하고 company 를 강제한다', () => {
    const ok = pickInspectionItemInsert(
      {
        process: '주조',
        kind: 'equipment_check',
        item_no: 1,
        title: '습동유',
        company_id: COMPANY,
      },
      COMPANY
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.row.company_id, COMPANY);
    assert.equal(ok.row.sort_order, 1);
    assert.equal(ok.row.is_active, true);

    const hijack = pickInspectionItemInsert(
      {
        process: '주조',
        kind: 'equipment_check',
        item_no: 1,
        title: '습동유',
        company_id: 'other',
      },
      COMPANY
    );
    assert.equal(hijack.ok, false);

    const badKind = pickInspectionItemInsert(
      { process: '주조', kind: 'other', item_no: 1, title: 'x' },
      COMPANY
    );
    assert.equal(badKind.ok, false);
  });

  it('update 0행이면 실패로 판정한다', () => {
    const missing = assertUpdatedRow(null);
    assert.equal(missing.ok, false);
    assert.match(missing.error, /찾지 못/);

    const found = assertUpdatedRow({ id: 'a1', title: 'ok' });
    assert.equal(found.ok, true);
    assert.equal(found.row.id, 'a1');
  });
});

describe('inspection header 집계', () => {
  it('부분 확정과 취소 회차의 원래 촬영 수 및 회차 번호를 유지한다', () => {
    for (const status of ['confirmed', 'cancelled']) {
      const h = summarizeInspectionHeader({round_no: 3, round_status: status, required_count: 10}, 7);
      assert.equal(h.progress_label, '7/10');
      assert.equal(h.round_status, status);
      assert.equal(h.round_no, 3);
    }
  });

  it('같은 설비의 야간 LOT와 겹치는 회차만 포함하고 열린 회차는 다음 근무일 08시에 끝난다', () => {
    const h = { equipment_code: 'DC1', work_date: '2026-11-25', created_at: '2026-11-26T02:00:00+09:00' };
    const clock = Date.parse('2026-11-27T12:00:00+09:00');
    assert.equal(inspectionTime(h.created_at), '2026-11-26 02:00');
    assert.equal(roundInterval(h, clock).to, '2026-11-25T23:00:00.000Z');
    const lot = {equipmentId: 'DC1', startAt:'2026-11-26T01:48:00+09:00', endAt:'2026-11-26T02:04:00+09:00'};
    assert.equal(lotOverlapsRound(lot,h,clock), true);
    assert.equal(lotOverlapsRound({...lot, equipmentId:'DC2'},h,clock), false);
    assert.equal(lotOverlapsRound({...lot, endAt:'2026-11-26T01:59:00+09:00'},h,clock), false);
    assert.equal(lotOverlapsRound({...lot, startAt:'2026-11-26T08:01:00+09:00', endAt:null},h,clock), false);
  });
  it('완료/미완료와 N/required 진행 표시를 만든다', () => {
    const incomplete = summarizeInspectionHeader(
      {
        id: 'h1',
        equipment_code: 'DC-01',
        equipment_name: '350T #1',
        required_count: 10,
        is_completed: false,
        completed_at: null,
        worker_name: '홍길동',
        kind: 'equipment_check',
      },
      7
    );
    assert.equal(incomplete.status, 'incomplete');
    assert.equal(incomplete.progress_label, '7/10');
    assert.equal(incomplete.active_count, 7);
    assert.equal(incomplete.is_completed, false);
    assert.equal(incomplete.equipment_name, '350T #1');

    const complete = summarizeInspectionHeader(
      {
        id: 'h2',
        required_count: 10,
        is_completed: true,
        completed_at: '2026-11-17T01:00:00Z',
      },
      10
    );
    assert.equal(complete.status, 'completed');
    assert.equal(complete.progress_label, '10/10');
    assert.equal(complete.completed_at, '2026-11-17T01:00:00Z');
  });
});
