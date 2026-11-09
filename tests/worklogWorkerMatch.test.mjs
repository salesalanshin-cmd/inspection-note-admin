import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWorkerNameIndex,
  hangulEditDistance,
  matchSheetWorkers,
  matchWorkerName,
  namesFromMatchedWorkers,
} from '../lib/worklogWorkerMatch.js';
import { countWorkerNamesFromLines } from '../lib/inspectionStats.js';

describe('hangulEditDistance', () => {
  it('한글 음절 편집거리를 센다', () => {
    assert.equal(hangulEditDistance('염아화', '염애화'), 1);
    assert.equal(hangulEditDistance('이다미영', '이미영'), 1); // 삭제 1회 — 매칭 규칙에서는 길이 불일치로 제외
    assert.equal(hangulEditDistance('이미영', '이미영'), 0);
  });
});

describe('matchWorkerName', () => {
  const index = buildWorkerNameIndex([
    { worker_name: '염애화', process: '검사' },
    { worker_name: '이미영', process: '검사' },
    { worker_name: '김원희', process: '검사' },
  ]);

  it('정확 일치와 편집거리 1·유일 후보만 매칭한다', () => {
    assert.equal(matchWorkerName('염애화', index).worker_name, '염애화');
    assert.equal(matchWorkerName('염아화', index).worker_name, '염애화');
    assert.equal(matchWorkerName('이다미영', index), null);
  });

  it('matched_workers 배열을 만들고 집계 이름을 고른다', () => {
    const matched = matchSheetWorkers('염아화, 모르는사람', index);
    assert.deepEqual(matched, [
      { raw: '염아화', name: '염애화', process: '검사' },
      { raw: '모르는사람', name: null, process: null },
    ]);
    assert.deepEqual(namesFromMatchedWorkers(matched), ['염애화', '모르는사람']);
    assert.equal(
      countWorkerNamesFromLines([{ matchedWorkers: matched, workerName: '염아화, 모르는사람' }]),
      2
    );
  });
});
