import {
  DOC_ERROR_CODES,
  DOC_ERROR_DESCRIPTIONS,
  SOS_ERROR_CODES,
  SOS_ERROR_CATEGORIES,
} from './constants';
import { DEFECT_CODE_DEFINITIONS } from './defectCodeDefinitions';
import {
  fetchPastCorrectionExamples,
  formatPastCasesForPrompt,
} from './aiCorrectionLog';
import { supabase } from './supabase';

/**
 * 동일 제품명의 최근 불량 기록에서 defect_code 분포 집계
 * @param {string} productName
 * @param {{ limit?: number }} [options]
 * @returns {Promise<Array<{ code: string, count: number }>|null>}
 */
export async function fetchProductDefectStats(productName, options = {}) {
  const name = String(productName || '').trim();
  if (!name) return null;

  const limit = options.limit ?? 20;
  const { data, error } = await supabase
    .from('defect_reports')
    .select('defect_code')
    .eq('product_name', name)
    .or('is_deleted.eq.false,is_deleted.is.null')
    .not('defect_code', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[fetchProductDefectStats]', error.message);
    return null;
  }
  if (!data?.length) return null;

  const counts = new Map();
  for (const row of data) {
    const code = row.defect_code;
    if (!code) continue;
    counts.set(code, (counts.get(code) || 0) + 1);
  }
  if (!counts.size) return null;

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, count]) => ({ code, count }));
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

function formatDefectCodeList() {
  return DEFECT_CODE_DEFINITIONS.map(
    (d) =>
      `- ${d.code} ${d.label}: ${d.definition} / 판정기준: ${d.criteria} / 주요 발생부위: ${d.location}`
  ).join('\n');
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
 * @param {{
 *   regionCrop?: boolean,
 *   pastCases?: Array|null,
 *   productName?: string|null,
 *   productDefectStats?: Array<{ code: string, count: number }>|null,
 * }} [options]
 *   pastCases가 명시되면(빈 배열 포함) 재조회하지 않음. undefined면 DB에서 조회.
 *   productDefectStats가 undefined이고 productName이 있으면 동일 제품 과거 기록을 조회.
 * @returns {Promise<string>}
 */
export async function buildClassifyPrompt(codeSet, options = {}) {
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

  let pastCases = options.pastCases;
  if (pastCases === undefined) {
    try {
      pastCases = await fetchPastCorrectionExamples(codeSet);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[buildClassifyPrompt] past cases fetch failed:', err);
      pastCases = [];
    }
  }

  const pastCasesSection = formatPastCasesForPrompt(codeSet, pastCases);

  let productStats = options.productDefectStats;
  const productName =
    codeSet === 'defect' ? String(options.productName || '').trim() : '';
  if (productStats === undefined && productName) {
    try {
      productStats = await fetchProductDefectStats(productName);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[buildClassifyPrompt] product stats fetch failed:', err);
      productStats = null;
    }
  }
  const productStatsSection = formatProductDefectStatsForPrompt(
    productName,
    productStats
  );

  return `당신은 ${config.title}을 분석하는 품질 검사 전문가입니다.
사진에서 가장 적합한 오류 코드 하나를 아래 목록에서만 선택하세요.
${regionContext}${pastCasesSection}${productStatsSection}

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
