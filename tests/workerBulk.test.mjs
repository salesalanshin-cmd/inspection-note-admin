import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MSG_ALREADY_REGISTERED,
  buildNewWorkerRow,
  buildRestorePatch,
  classifyWorkerImport,
  parseWorkerPaste,
} from '../lib/workerBulk.js';

describe('parseWorkerPaste', () => {
  it('탭·쉼표 구분과 생략된 뒤 항목을 읽는다', () => {
    const rows = parseWorkerPaste('홍길동\t베트남\t야간\t주조\n김철수,태국,주간\n박민수');
    assert.deepEqual(rows, [
      { name: '홍길동', nationality: '베트남', shift: 'night', process: '주조', error: null },
      { name: '김철수', nationality: '태국', shift: 'day', process: null, error: null },
      { name: '박민수', nationality: null, shift: null, process: null, error: null },
    ]);
  });

  it('교대 표기 주간/야간/day/night/주/야와 대소문자를 인식한다', () => {
    const rows = parseWorkerPaste(
      ['가,한국,주', '나,한국,야', '다,한국,day', '라,한국,NIGHT', '마,한국,주간', '바,한국,야간'].join(
        '\n'
      )
    );
    assert.deepEqual(
      rows.map((row) => row.shift),
      ['day', 'night', 'day', 'night', 'day', 'night']
    );
  });

  it('앞뒤 공백과 빈 값은 지우고, 빈 줄은 버린다', () => {
    const rows = parseWorkerPaste('  홍길동  ,  ,  day  ,   \n\n   \n,베트남,주간');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].name, '홍길동');
    assert.equal(rows[0].nationality, null);
    assert.equal(rows[0].shift, 'day');
    assert.equal(rows[0].process, null);
    assert.equal(rows[0].error, null);
    assert.equal(rows[1].error, '이름이 비어 있습니다');
  });

  it('알 수 없는 교대는 오류다', () => {
    const [row] = parseWorkerPaste('홍길동,한국,저녁,주조');
    assert.equal(row.error, '교대 표기를 알 수 없습니다');
    assert.equal(row.shift, null);
  });
});

describe('classifyWorkerImport', () => {
  const directory = [
    { worker_name: '홍길동', removed: false, nationality: '한국' },
    { worker_name: 'Kim', removed: true, nationality: '베트남', default_shift: 'night' },
    { worker_name: '이퇴사', removed: true },
  ];

  it('활성은 중복, 퇴사는 복원, 없으면 신규', () => {
    const parsed = parseWorkerPaste('홍길동\n이퇴사,네팔,야,사상\n신규자');
    const classified = classifyWorkerImport(parsed, directory);
    assert.equal(classified[0].status, 'duplicate');
    assert.equal(classified[0].message, MSG_ALREADY_REGISTERED);
    assert.equal(classified[1].status, 'restore');
    assert.equal(classified[1].existing.worker_name, '이퇴사');
    assert.deepEqual(buildRestorePatch(classified[1]), {
      removed: false,
      nationality: '네팔',
      default_shift: 'night',
      process: '사상',
    });
    assert.equal(classified[2].status, 'new');
  });

  it('대소문자와 공백만 달라도 같은 이름으로 본다', () => {
    const parsed = parseWorkerPaste(' kim \n홍 길동\nKIM,태국,주');
    const classified = classifyWorkerImport(parsed, directory);
    assert.equal(classified[0].status, 'restore');
    assert.equal(classified[0].existing.worker_name, 'Kim');
    assert.equal(classified[1].status, 'duplicate');
    assert.equal(classified[2].status, 'duplicate');
  });

  it('복원 패치는 비어 있는 국적·교대·공정을 덮어쓰지 않는다', () => {
    assert.deepEqual(buildRestorePatch({ nationality: null, shift: null, process: '  ' }), {
      removed: false,
    });
  });

  it('오류 행은 등록 대상이 아니다', () => {
    const [row] = classifyWorkerImport(parseWorkerPaste('홍길동,한국,낮'), directory);
    assert.equal(row.status, 'error');
  });
});

describe('buildNewWorkerRow', () => {
  it('미지정 국적·교대·공정·표시명은 null이고 이름은 trim 한다', () => {
    const row = buildNewWorkerRow(
      {
        name: '  신규자  ',
        displayName: '  ',
        nationality: '',
        shift: '',
        process: ' ',
        role: 'worker',
        note: '',
      },
      'company-1'
    );
    assert.equal(row.worker_name, '신규자');
    assert.equal(row.company_id, 'company-1');
    assert.equal(row.display_name, null);
    assert.equal(row.nationality, null);
    assert.equal(row.default_shift, null);
    assert.equal(row.process, null);
    assert.equal(row.note, '');
    assert.equal(row.role, 'worker');
    assert.equal(row.excluded, false);
  });
});
