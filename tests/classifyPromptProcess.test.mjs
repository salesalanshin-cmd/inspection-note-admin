import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateNegativeEvidence,
  formatMisdiagnosisBannerLine,
  formatNegativeEvidenceForPrompt,
} from '../lib/aiCorrectionSelect.js';
import {
  composeClassifyPrompt,
  defectCodeProcessGroup,
  formatDefectCodeList,
  formatMcGuardRules,
} from '../lib/classifyPromptFormat.js';
import { applyMcNeedsReview, resolveMcNeedsReview } from '../lib/mcNeedsReview.js';
import {
  lookupWorkerProcess,
  normalizeProcessHint,
  resolveProcessHint,
} from '../lib/processHint.js';

describe('processHint', () => {
  it('defect_stage → worker → product 순으로 고른다', () => {
    assert.equal(
      resolveProcessHint({
        defectStage: '주조',
        workerProcess: '가공',
        productProcess: '사상',
      }),
      '주조'
    );
    assert.equal(
      resolveProcessHint({
        defectStage: null,
        workerProcess: '가공',
      }),
      '가공'
    );
    assert.equal(
      resolveProcessHint({
        defectStage: '검사',
        workerProcess: '기타',
        productProcess: null,
      }),
      '없음'
    );
    assert.equal(normalizeProcessHint('초품'), '주조');
    assert.equal(normalizeProcessHint('종품'), '가공');
  });

  it('worker_directory에서 process를 찾는다', () => {
    assert.equal(
      lookupWorkerProcess(
        [{ worker_name: '김', process: '사상' }],
        '김'
      ),
      '사상'
    );
    assert.equal(lookupWorkerProcess([], '김'), null);
  });
});

describe('formatDefectCodeList / MC rules', () => {
  it('공정 힌트가 있으면 우선 후보가 앞에 오고 기타는 뒤에 남는다', () => {
    const casting = formatDefectCodeList('주조');
    assert.match(casting, /### 우선 후보 \(공정 힌트: 주조\)/);
    assert.match(casting, /### 기타 공정 코드/);
    const preferredIdx = casting.indexOf('### 우선 후보');
    const otherIdx = casting.indexOf('### 기타 공정 코드');
    const mcIdx = casting.indexOf('- MC003');
    const aIdx = casting.indexOf('- A010');
    assert.ok(preferredIdx < otherIdx);
    assert.ok(aIdx > preferredIdx && aIdx < otherIdx);
    assert.ok(mcIdx > otherIdx);

    const flat = formatDefectCodeList('없음');
    assert.doesNotMatch(flat, /### 우선 후보/);
    assert.match(flat, /- MC003/);
  });

  it('코드 접두사로 공정 그룹을 나눈다', () => {
    assert.equal(defectCodeProcessGroup('A010'), '주조');
    assert.equal(defectCodeProcessGroup('GR001'), '사상');
    assert.equal(defectCodeProcessGroup('MC003'), '가공');
  });

  it('MC 가드 문구와 주조/사상 시 더 엄격한 규칙을 넣는다', () => {
    const base = formatMcGuardRules('없음');
    assert.match(base, /confidence=high일 때만/);
    assert.doesNotMatch(base, /더 엄격히/);

    const casting = formatMcGuardRules('주조');
    assert.match(casting, /더 엄격히/);
    assert.match(casting, /주조/);
  });
});

describe('negative evidence', () => {
  const rows = [
    {
      ai_suggested_code: 'MC003',
      final_code: 'A010',
      product_name: 'L1100 B.ROD',
      was_ai_accepted: false,
    },
    {
      ai_suggested_code: 'MC003',
      final_code: 'A010',
      product_name: 'L1100 B.ROD',
      was_ai_accepted: false,
    },
    {
      ai_suggested_code: 'MC003',
      final_code: 'A002',
      product_name: 'L1100 B.ROD',
      was_ai_accepted: false,
    },
    {
      ai_suggested_code: 'MC001',
      final_code: 'A001',
      product_name: 'L1100 B.ROD',
      was_ai_accepted: false,
    },
    {
      ai_suggested_code: 'A009',
      final_code: 'A010',
      product_name: '다른제품',
      was_ai_accepted: false,
    },
    {
      ai_suggested_code: 'A009',
      final_code: 'A010',
      product_name: '다른제품',
      was_ai_accepted: false,
    },
  ];

  it('2회 미만 조합은 빼고 상한을 적용한다', () => {
    const groups = aggregateNegativeEvidence(rows, {
      productName: 'L1100 B.ROD',
      minCount: 2,
      limit: 5,
    });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].aiCode, 'MC003');
    assert.equal(groups[0].total, 3);
    assert.equal(groups[0].finals[0].finalCode, 'A010');
    assert.equal(groups[0].finals[0].count, 2);

    const onceOnly = aggregateNegativeEvidence(
      [
        {
          ai_suggested_code: 'MC003',
          final_code: 'A010',
          product_name: 'L1100 B.ROD',
          was_ai_accepted: false,
        },
      ],
      { productName: 'L1100 B.ROD' }
    );
    assert.deepEqual(onceOnly, []);
  });

  it('프롬프트 섹션 문구를 만든다', () => {
    const groups = aggregateNegativeEvidence(rows, {
      productName: 'L1100 B.ROD',
    });
    const section = formatNegativeEvidenceForPrompt(groups, {
      productName: 'L1100 B.ROD',
    });
    assert.match(section, /이 제품\(L1100 B\.ROD\)에서 반복된 AI 오진/);
    assert.match(section, /MC003→A010 2회/);
    assert.match(section, /MC003는 이 제품에서 3회 오진됨/);
    assert.match(section, /MC003 제안을 피하고/);
  });

  it('배너 요약 문구를 만든다', () => {
    const line = formatMisdiagnosisBannerLine(
      'MC003',
      [
        { finalCode: 'A010', count: 2, sameProductCount: 2 },
        { finalCode: 'A002', count: 1, sameProductCount: 1 },
      ],
      { productScoped: true }
    );
    assert.equal(
      line,
      '이 제품에서 MC003는 3회 정정됨(주 정정: A010 2회)'
    );
  });
});

describe('composeClassifyPrompt defect', () => {
  it('공정 힌트·MC 규칙·부정 증거를 넣고 응답 형식을 유지한다', () => {
    const groups = aggregateNegativeEvidence(
      [
        {
          ai_suggested_code: 'MC003',
          final_code: 'A010',
          product_name: 'L1100 B.ROD',
          was_ai_accepted: false,
        },
        {
          ai_suggested_code: 'MC003',
          final_code: 'A010',
          product_name: 'L1100 B.ROD',
          was_ai_accepted: false,
        },
      ],
      { productName: 'L1100 B.ROD' }
    );

    const prompt = composeClassifyPrompt('defect', {
      pastCases: [],
      productDefectStats: null,
      productName: 'L1100 B.ROD',
      processHint: '주조',
      negativeEvidence: groups,
    });

    assert.match(prompt, /### 우선 후보 \(공정 힌트: 주조\)/);
    assert.match(prompt, /공정 힌트는 "주조"/);
    assert.match(prompt, /confidence=high일 때만/);
    assert.match(prompt, /더 엄격히/);
    assert.match(prompt, /MC003→A010 2회/);
    assert.match(prompt, /사용자가 정정한 사례는 AI의 기존 판단보다 우선한다/);
    assert.match(prompt, /"code": "코드값 또는 null"/);
    assert.match(prompt, /"confidence": "high" \| "medium" \| "low"/);

    const preferredIdx = prompt.indexOf('### 우선 후보');
    const otherIdx = prompt.indexOf('### 기타 공정 코드');
    const mcInPreferred = prompt.indexOf('- MC003', preferredIdx);
    assert.ok(mcInPreferred > otherIdx);
  });

  it('부정 증거가 2회 미만이면 섹션이 비어 있다', () => {
    const prompt = composeClassifyPrompt('defect', {
      pastCases: [],
      productDefectStats: null,
      productName: 'L1100 B.ROD',
      processHint: '없음',
      negativeEvidence: [],
    });
    assert.doesNotMatch(prompt, /반복된 AI 오진/);
  });
});

describe('needsReview 후처리', () => {
  it('MC + medium → needsReview', () => {
    assert.deepEqual(
      resolveMcNeedsReview({ code: 'MC003', confidence: 'medium' }, '없음'),
      { needsReview: true }
    );
  });

  it('MC + high + 주조 → needsReview (코드 유지)', () => {
    const out = applyMcNeedsReview(
      { code: 'MC003', confidence: 'high', reason: '거친면' },
      '주조'
    );
    assert.equal(out.code, 'MC003');
    assert.equal(out.confidence, 'high');
    assert.equal(out.needsReview, true);
  });

  it('MC + high + 가공 → needsReview false', () => {
    assert.equal(
      applyMcNeedsReview({ code: 'MC003', confidence: 'high' }, '가공').needsReview,
      false
    );
  });

  it('A 계열은 processHint와 무관하게 needsReview false', () => {
    assert.equal(
      applyMcNeedsReview({ code: 'A010', confidence: 'low' }, '주조').needsReview,
      false
    );
  });
});
