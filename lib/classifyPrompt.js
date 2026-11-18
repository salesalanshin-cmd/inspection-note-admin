import {
  fetchPastCorrectionExamples,
} from './aiCorrectionLog';
import { getCompanyId } from './company';
import { supabase } from './supabase';
import { normalizeProcessHint } from './processHint';
import {
  composeClassifyPrompt,
  defectCodeProcessGroup,
  formatDefectCodeList,
  formatMcGuardRules,
  formatProductDefectStatsForPrompt,
} from './classifyPromptFormat';

export {
  composeClassifyPrompt,
  defectCodeProcessGroup,
  formatDefectCodeList,
  formatMcGuardRules,
  formatProductDefectStatsForPrompt,
};

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
  let companyId;
  try {
    companyId = await getCompanyId();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[fetchProductDefectStats] company_id', err?.message);
    return null;
  }

  const { data, error } = await supabase
    .from('defect_reports')
    .select('defect_code')
    .eq('company_id', companyId)
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

/**
 * @param {'defect' | 'sos' | 'doc'} codeSet
 * @param {{
 *   regionCrop?: boolean,
 *   pastCases?: Array|null,
 *   productName?: string|null,
 *   productDefectStats?: Array<{ code: string, count: number }>|null,
 *   processHint?: string|null,
 *   negativeEvidence?: Array|null,
 * }} [options]
 * @returns {Promise<string>}
 */
export async function buildClassifyPrompt(codeSet, options = {}) {
  const productName =
    codeSet === 'defect' ? String(options.productName || '').trim() : '';

  let pastCases = options.pastCases;
  if (pastCases === undefined) {
    try {
      pastCases = await fetchPastCorrectionExamples(codeSet, {
        productName: productName || undefined,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[buildClassifyPrompt] past cases fetch failed:', err?.message || err);
      pastCases = [];
    }
  }

  let productStats = options.productDefectStats;
  if (productStats === undefined && productName) {
    try {
      productStats = await fetchProductDefectStats(productName);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[buildClassifyPrompt] product stats fetch failed:', err);
      productStats = null;
    }
  }

  return composeClassifyPrompt(codeSet, {
    ...options,
    pastCases,
    productDefectStats: productStats,
    processHint:
      codeSet === 'defect' ? normalizeProcessHint(options.processHint) : '없음',
  });
}
