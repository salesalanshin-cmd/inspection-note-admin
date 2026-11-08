import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kstWallToUtc } from '../lib/kst.js';
import {
  UNMATCHED_EMPTY_NAME,
  isBlankOrUnknownName,
  normalizeSignalName,
  summarizeUnmatchedNames,
  unmatchedLookbackRange,
} from '../lib/attendance/unmatchedNames.js';

const NOW = kstWallToUtc(2026, 10, 8, 15, 0, 0);

function at(day, hours, minutes = 0) {
  return kstWallToUtc(2026, 10, day, hours, minutes, 0).toISOString();
}

const DIRECTORY = [
  { worker_name: '김철수', display_name: '철수', removed: false, excluded: false },
  { worker_name: '김작업', display_name: 'Kim', removed: false, excluded: false },
  { worker_name: '퇴사자', display_name: '이전이름', removed: true, excluded: false },
  { worker_name: '제외됨', display_name: '', removed: false, excluded: true },
];

describe('normalize and alias', () => {
  it('앞뒤 공백은 지우고 대소문자와 가운데 공백은 남긴다', () => {
    assert.equal(normalizeSignalName('  김철수  '), '김철수');
    assert.equal(normalizeSignalName('kim'), 'kim');
    assert.equal(normalizeSignalName('김 철수'), '김 철수');
    assert.equal(isBlankOrUnknownName('  '), true);
    assert.equal(isBlankOrUnknownName('Unknown'), true);
    assert.equal(isBlankOrUnknownName('김철수'), false);
  });

  it('활성 이름·별칭은 빼고, 대소문자가 다르면 미등록이다', () => {
    const summary = summarizeUnmatchedNames({
      now: NOW,
      directory: DIRECTORY,
      signals: [
        { worker_name: '  김철수 ', at: at(8, 10), type: 'frequent' },
        { worker_name: '철수', at: at(8, 11), type: 'fives' },
        { worker_name: 'Kim', at: at(8, 12), type: 'defect' },
        { worker_name: 'kim', at: at(8, 13), type: 'frequent' },
        { worker_name: '김 철수', at: at(8, 14), type: 'fives' },
      ],
    });
    assert.deepEqual(summary.unregistered.map((row) => row.name), ['김 철수', 'kim']);
    assert.equal(summary.hidden.length, 0);
  });
});

describe('hidden and empty names', () => {
  it('숨김·제외는 미등록이 아니라 숨김/퇴사이고 별칭도 같은 구분이다', () => {
    const summary = summarizeUnmatchedNames({
      now: NOW,
      directory: DIRECTORY,
      signals: [
        { worker_name: '퇴사자', at: at(8, 9), type: 'fives' },
        { worker_name: '이전이름', at: at(8, 9, 30), type: 'frequent' },
        { worker_name: '제외됨', at: at(7, 18), type: 'document' },
        { worker_name: '새사람', at: at(8, 10), type: 'lot_move' },
      ],
    });
    assert.deepEqual(summary.unregistered.map((row) => row.name), ['새사람']);
    assert.deepEqual(summary.hidden.map((row) => row.name), ['이전이름', '제외됨', '퇴사자']);
  });

  it('빈 값과 unknown 은 한 줄이다', () => {
    const summary = summarizeUnmatchedNames({
      now: NOW,
      directory: DIRECTORY,
      signals: [
        { worker_name: '', at: at(8, 9), type: 'document' },
        { worker_name: '   ', at: at(8, 10), type: 'fives' },
        { worker_name: 'unknown', at: at(8, 11), type: 'frequent' },
        { worker_name: 'UNKNOWN', at: at(8, 12), type: 'defect' },
      ],
    });
    assert.equal(summary.unregistered.length, 1);
    assert.equal(summary.unregistered[0].name, UNMATCHED_EMPTY_NAME);
    assert.equal(summary.unregistered[0].count, 4);
    assert.equal(summary.unregistered[0].byType.document, 1);
    assert.equal(summary.unregistered[0].byType.fives, 1);
    assert.equal(summary.unregistered[0].byType.frequent, 1);
    assert.equal(summary.unregistered[0].byType.defect, 1);
  });
});

describe('range and counts', () => {
  it('KST 기간 경계 밖은 빼고, 08:00 이전이면 전 근무일이다', () => {
    const range = unmatchedLookbackRange(NOW, 7);
    assert.equal(range.start.toISOString(), kstWallToUtc(2026, 10, 2, 0, 0, 0).toISOString());
    assert.equal(range.end.toISOString(), kstWallToUtc(2026, 10, 9, 0, 0, 0).toISOString());

    const summary = summarizeUnmatchedNames({
      now: NOW,
      days: 7,
      directory: DIRECTORY,
      signals: [
        { worker_name: '경계', at: kstWallToUtc(2026, 10, 2, 0, 0, 0).toISOString(), type: 'fives' },
        { worker_name: '경계', at: kstWallToUtc(2026, 10, 1, 23, 59, 0).toISOString(), type: 'fives' },
        { worker_name: '경계', at: kstWallToUtc(2026, 10, 9, 0, 0, 0).toISOString(), type: 'fives' },
        { worker_name: '새벽', at: at(8, 7, 59), type: 'frequent' },
        { worker_name: '아침', at: at(8, 8, 0), type: 'frequent' },
      ],
    });
    const edge = summary.unregistered.find((row) => row.name === '경계');
    const dawn = summary.unregistered.find((row) => row.name === '새벽');
    const morning = summary.unregistered.find((row) => row.name === '아침');
    assert.equal(edge.count, 1);
    assert.equal(edge.lastWorkDate, '2026-11-01');
    assert.equal(dawn.lastWorkDate, '2026-11-07');
    assert.equal(dawn.lastAtLabel, '2026-11-08 07:59');
    assert.equal(morning.lastWorkDate, '2026-11-08');
    assert.equal(morning.lastAtLabel, '2026-11-08 08:00');
  });

  it('종류별 건수와 마지막 신호·최근 근무일을 모은다', () => {
    const summary = summarizeUnmatchedNames({
      now: NOW,
      directory: [],
      signals: [
        { worker_name: '신규', at: at(6, 21), type: 'fives' },
        { worker_name: '신규', at: at(6, 22), type: 'fives' },
        { worker_name: '신규', at: at(8, 1), type: 'frequent' },
        { worker_name: '다른사람', at: at(7, 12), type: 'defect' },
      ],
    });
    const row = summary.unregistered.find((item) => item.name === '신규');
    assert.equal(row.count, 3);
    assert.equal(row.byType.fives, 2);
    assert.equal(row.byType.frequent, 1);
    assert.equal(row.typeLabel, '3정5S 2 · 자주검사 1');
    assert.equal(row.lastAtLabel, '2026-11-08 01:00');
    assert.equal(row.lastWorkDate, '2026-11-07');
    assert.equal(summary.unregistered[0].name, '신규');
  });
});
