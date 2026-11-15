import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertTrashAffected, formatTrashWriteError } from '../lib/trash.js';

describe('trash write result', () => {
  it('요청 수와 반환 수가 같으면 통과한다', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    assert.deepEqual(assertTrashAffected(['a', 'b'], rows), rows);
  });

  it('반환 수가 요청보다 적으면 throw 한다', () => {
    assert.throws(
      () => assertTrashAffected(['a', 'b'], [{ id: 'a' }]),
      (err) => {
        assert.equal(err.message, '2건 중 1건만 처리됨. 권한 또는 회사 조건 때문일 수 있음');
        return true;
      }
    );
  });

  it('반환이 0건이면 throw 한다', () => {
    assert.throws(
      () => assertTrashAffected(['a', 'b'], []),
      (err) => {
        assert.equal(err.message, '2건 중 0건만 처리됨. 권한 또는 회사 조건 때문일 수 있음');
        return true;
      }
    );
    assert.throws(
      () => assertTrashAffected(['a'], null),
      /1건 중 0건만 처리됨/
    );
  });

  it('deleted_at 없음(42703)은 권한 실패와 다른 문장이다', () => {
    const missingColumn = formatTrashWriteError({
      code: '42703',
      message: 'column "deleted_at" of relation "defect_reports" does not exist',
    });
    const denied = formatTrashWriteError({
      code: '42501',
      message: 'new row violates row-level security policy',
    });

    assert.match(missingColumn, /deleted_at/);
    assert.match(missingColumn, /42703/);
    assert.match(missingColumn, /마이그레이션 005/);
    assert.equal(missingColumn.includes('권한 또는 회사 조건'), false);
    assert.match(denied, /42501/);
    assert.equal(denied.includes('deleted_at'), false);
    assert.notEqual(missingColumn, denied);
  });
});
