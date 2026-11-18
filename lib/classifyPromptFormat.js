import {
  DOC_ERROR_CODES,
  DOC_ERROR_DESCRIPTIONS,
  SOS_ERROR_CODES,
  SOS_ERROR_CATEGORIES,
  getCodeLabel,
} from './constants.js';
import { DEFECT_CODE_DEFINITIONS } from './defectCodeDefinitions.js';
import {
  formatCorrectionExampleLine,
  formatNegativeEvidenceForPrompt,
} from './aiCorrectionSelect.js';
import { normalizeProcessHint, PROCESS_HINT_CODES } from './processHint.js';

/**
 * @param {string} code
 * @returns {'주조'|'사상'|'가공'|null}
 */
export function defectCodeProcessGroup(code) {
  const text = code == null ? '' : String(code).trim();
  if (!text) return null;
  if (text.startsWith('MC')) return '가공';
  if (text.startsWith('GR')) return '사상';
  if (text.startsWith('A')) return '주조';
  return null;
}

function formatOneDefectCode(d) {
  return `- ${d.code} ${d.label}: ${d.definition} / 판정기준: ${d.criteria} / 주요 발생부위: ${d.location}`;
}

/**
 * processHint가 주조|사상|가공이면 해당 그룹을 우선 후보로 앞에 두고 나머지는 뒤에.
 * 후보를 삭제하지 않는다. '없음'이면 기존처럼 단일 목록.
 *
 * @param {'주조'|'사상'|'가공'|'없음'|string|null|undefined} processHint
 * @returns {string}
 */
export function formatDefectCodeList(processHint) {
  const hint = normalizeProcessHint(processHint);
  if (!PROCESS_HINT_CODES.includes(hint)) {
    return DEFECT_CODE_DEFINITIONS.map(formatOneDefectCode).join('\n');
  }

  const preferred = [];
  const others = [];
  for (const def of DEFECT_CODE_DEFINITIONS) {
    const group = defectCodeProcessGroup(def.code);
    if (group === hint) preferred.push(def);
    else others.push(def);
  }

  const preferredBlock = preferred.map(formatOneDefectCode).join('\n');
  const otherBlock = others.map(formatOneDefectCode).join('\n');
  return `### 우선 후보 (공정 힌트: ${hint})
${preferredBlock}

### 기타 공정 코드 (해당 공정 증거가 사진에서 명확할 때만 선택)
${otherBlock}`;
}

/**
 * @param {'주조'|'사상'|'가공'|'없음'|string|null|undefined} processHint
 * @returns {string}
 */
export function formatMcGuardRules(processHint) {
  const hint = normalizeProcessHint(processHint);
  const lines = [
    '- MC 계열(MC001~MC005)은 절삭면·탭·치수 등 가공 증거가 사진에서 명확하고 confidence=high일 때만 선택한다.',
  ];
  if (hint === '주조' || hint === '사상') {
    lines.push(
      `- 공정 힌트가 ${hint}이므로 MC 제안은 더 엄격히 적용한다. 가공 증거가 확실하지 않으면 MC를 고르지 말고 A/GR 중 적합한 코드를 선택한다.`
    );
  }
  return lines.join('\n');
}

/** 제품별 과거 불량 분포를 프롬프트 섹션으로 포맷 (없으면 빈 문자열) */
export function formatProductDefectStatsForPrompt(productName, stats) {
  const name = String(productName || '').trim();
  if (!name || !stats?.length) return '';
  const list = stats.map((s) => `${s.code}(${s.count}건)`).join(', ');
  return `

## 제품별 참고 정보
이 사진은 제품명 "${name}"입니다.
이 제품에서 자주 발생하는 불량 유형: ${list}
위 분포는 참고용이며, 사진에 보이는 실제 불량에 맞는 코드를 선택하세요.`;
}

function formatSosCodeList() {
  return Object.entries(SOS_ERROR_CATEGORIES)
    .map(([category, codes]) => {
      const lines = codes
        .map((code) => `- ${code}: ${SOS_ERROR_CODES[code] || code}`)
        .join('\n');
      return `### ${category}\n${lines}`;
    })
    .join('\n');
}

function formatDocCodeList() {
  return Object.entries(DOC_ERROR_CODES)
    .map(([code, label]) => {
      const desc = DOC_ERROR_DESCRIPTIONS[code];
      return desc ? `- ${code}: ${label} (${desc})` : `- ${code}: ${label}`;
    })
    .join('\n');
}

function formatPastCasesForPrompt(codeSet, examples) {
  if (!examples?.length) return '';
  const lines = examples.map((ex) =>
    formatCorrectionExampleLine(ex, (code) => getCodeLabel(codeSet, code))
  );
  return `

## 과거 관리자 판정 사례
다음은 과거 관리자들이 실제로 판정한 사례들입니다. 이 패턴을 참고해서 판단하세요:
${lines.join('\n')}`;
}

/**
 * DB 조회 없는 순수 프롬프트 조립. 테스트·buildClassifyPrompt 공용.
 *
 * @param {'defect'|'sos'|'doc'} codeSet
 * @param {{
 *   regionCrop?: boolean,
 *   pastCases?: Array|null,
 *   productName?: string|null,
 *   productDefectStats?: Array|null,
 *   processHint?: string|null,
 *   negativeEvidence?: Array|null,
 * }} [options]
 * @returns {string}
 */
export function composeClassifyPrompt(codeSet, options = {}) {
  const processHint =
    codeSet === 'defect' ? normalizeProcessHint(options.processHint) : '없음';

  const config = {
    defect: {
      title: '제조 불량 사진',
      codeList: formatDefectCodeList(processHint),
      domain: '제품/공정 불량',
    },
    sos: {
      title: '3정5S 현장 사진',
      codeList: formatSosCodeList(),
      domain: '현장 정리·정돈·청소(3정5S) 관련 이상',
    },
    doc: {
      title: '문서 스캔 사진',
      codeList: formatDocCodeList(),
      domain: '문서 촬영 품질 및 내용 오류',
    },
  }[codeSet];

  if (!config) {
    throw new Error('Invalid codeSet');
  }

  let regionContext = '';
  if (options.regionCrop && codeSet === 'doc') {
    regionContext = `

## 이미지 맥락 (영역 crop)
이 이미지는 문서 전체가 아니라, 관리자가 지정한 **특정 영역만 잘라낸** 부분입니다.
문서 전체의 문제가 아니라 **이 영역에서 보이는 문제만** 판정하세요.
주변 문맥이 부족하더라도 잘라낸 칸·글씨·촬영 상태를 기준으로 코드를 선택하세요.`;
  } else if (options.regionCrop && codeSet === 'sos') {
    regionContext = `

## 이미지 맥락 (영역 crop)
이 영역은 3정5S 점검 사진의 특정 부분을 잘라낸 것입니다.
현장 전체보다 **이 잘라낸 부분에서 관찰되는 3정5S 이상(정품·정량·정위치·정리·정돈·청소·청결·습관화)** 만 판정하세요.`;
  }

  const productName =
    codeSet === 'defect' ? String(options.productName || '').trim() : '';

  const pastCasesSection = formatPastCasesForPrompt(codeSet, options.pastCases || []);
  const productStatsSection = formatProductDefectStatsForPrompt(
    productName,
    options.productDefectStats
  );

  const negativeEvidenceSection =
    codeSet === 'defect' && options.negativeEvidence !== undefined
      ? formatNegativeEvidenceForPrompt(options.negativeEvidence, { productName })
      : '';

  const processHintSection =
    codeSet === 'defect' && processHint !== '없음'
      ? `

## 공정 힌트
이 기록의 공정 힌트는 "${processHint}"입니다. 위 우선 후보를 먼저 검토하세요. 다른 공정 코드는 해당 공정 증거가 사진에서 명확할 때만 선택하세요.`
      : '';

  const mcRules =
    codeSet === 'defect' ? `\n${formatMcGuardRules(processHint)}` : '';

  return `당신은 ${config.title}을 분석하는 품질 검사 전문가입니다.
사진에서 가장 적합한 오류 코드 하나를 아래 목록에서만 선택하세요.
${negativeEvidenceSection}${regionContext}${processHintSection}${pastCasesSection}${productStatsSection}

## 오류 코드 목록
${config.codeList}

## 판정 규칙
- ${config.domain}에 해당하는 가장 적합한 코드 하나만 선택합니다.
- 사용자가 정정한 사례는 AI의 기존 판단보다 우선한다. 같은 제품에서 과거에 정정된 유형과 비슷한 사진이면 정정된 코드를 우선 고려하라.${mcRules}
- 목록에 맞는 코드가 없거나 판단이 불가능하면 code는 null로 반환합니다.
- confidence는 high(명확함), medium(다소 불확실), low(매우 불확실) 중 하나입니다.
- reason은 한글 20자 내외로 간단히 작성합니다.

## 응답 형식 (반드시 JSON만, 다른 텍스트 금지)
{
  "code": "코드값 또는 null",
  "confidence": "high" | "medium" | "low",
  "reason": "한글 설명"
}`;
}
