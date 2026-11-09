import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  pickAttendanceDailyPatch,
  resolveAttendanceSelect,
  sanitizeEditLogRows,
} from '../lib/attendance/adminAccess.js';

const COMPANY = 'company-1';

describe('attendance admin access', () => {
  it('허용 필드만 patch 로 남기고 company_id 불일치는 거절한다', () => {
    const ok = pickAttendanceDailyPatch(
      { judgment: 'present', shift: 'day', reviewed: true },
      COMPANY
    );
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.patch, { judgment: 'present', shift: 'day', reviewed: true });

    const badField = pickAttendanceDailyPatch({ secret: 1 }, COMPANY);
    assert.equal(badField.ok, false);

    const badCompany = pickAttendanceDailyPatch(
      { judgment: 'present', company_id: 'other' },
      COMPANY
    );
    assert.equal(badCompany.ok, false);
  });

  it('select 화이트리스트와 로그 company_id 를 강제한다', () => {
    assert.equal(resolveAttendanceSelect('*'), '*');
    assert.equal(resolveAttendanceSelect('id, worker_name'), 'id, worker_name');
    assert.equal(resolveAttendanceSelect('password')?.error != null, true);

    const logs = sanitizeEditLogRows(
      [
        {
          company_id: COMPANY,
          attendance_id: 'a1',
          work_date: '2026-11-01',
          field: 'shift',
          old_value: 'day',
          new_value: 'night',
        },
      ],
      COMPANY
    );
    assert.equal(logs.ok, true);
    assert.equal(logs.rows[0].company_id, COMPANY);

    const hijack = sanitizeEditLogRows(
      [{ company_id: 'other', attendance_id: 'a1', work_date: '2026-11-01', field: 'shift' }],
      COMPANY
    );
    assert.equal(hijack.ok, false);
  });
});
