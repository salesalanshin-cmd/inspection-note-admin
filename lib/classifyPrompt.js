import {
  DEFECT_CODE_LABELS,
  DOC_ERROR_CODES,
  DOC_ERROR_DESCRIPTIONS,
  SOS_ERROR_CODES,
  SOS_ERROR_CATEGORIES,
} from './constants';

function formatDefectCodeList() {
  return Object.entries(DEFECT_CODE_LABELS)
    .map(([code, label]) => `- ${code}: ${label}`)
    .join('\n');
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

/**
 * @param {'defect' | 'sos' | 'doc'} codeSet
 * @param {{ regionCrop?: boolean }} [options]
 * @returns {string}
 */
export function buildClassifyPrompt(codeSet, options = {}) {
  const config = {
    defect: {
      title: '제조 불량 사진',
      codeList: formatDefectCodeList(),
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

  return `당신은 ${config.title}을 분석하는 품질 검사 전문가입니다.
사진에서 가장 적합한 오류 코드 하나를 아래 목록에서만 선택하세요.
${regionContext}

## 오류 코드 목록
${config.codeList}

## 판정 규칙
- ${config.domain}에 해당하는 가장 적합한 코드 하나만 선택합니다.
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
