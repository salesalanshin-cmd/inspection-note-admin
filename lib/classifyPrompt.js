import {
  DEFECT_CODE_LABELS,
  DOC_ERROR_CODES,
  DOC_ERROR_DESCRIPTIONS,
  SOS_ERROR_CODES,
  SOS_ERROR_DESCRIPTIONS,
} from './constants';

function formatDefectCodeList() {
  return Object.entries(DEFECT_CODE_LABELS)
    .map(([code, label]) => `- ${code}: ${label}`)
    .join('\n');
}

function formatSosCodeList() {
  return Object.entries(SOS_ERROR_CODES)
    .map(([code, label]) => {
      const desc = SOS_ERROR_DESCRIPTIONS[code];
      return desc ? `- ${code}: ${label} (${desc})` : `- ${code}: ${label}`;
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
 * @returns {string}
 */
export function buildClassifyPrompt(codeSet) {
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

  return `당신은 ${config.title}을 분석하는 품질 검사 전문가입니다.
사진에서 가장 적합한 오류 코드 하나를 아래 목록에서만 선택하세요.

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
