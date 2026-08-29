import { supabase } from './supabase.js';
import { embedQuery } from './documents/voyage.js';

/**
 * @typedef {Object} KnowledgeHit
 * @property {'document'|'knowledge'} sourceKind
 * @property {string} content
 * @property {string|null} sourceLabel
 * @property {string|null} documentTitle
 * @property {number|null} pageFrom
 * @property {number} similarity
 * @property {string} [id]
 * @property {string} [sourceId]
 */

function normalizeHit(row) {
  return {
    sourceKind: row.source_kind,
    content: row.content,
    sourceLabel: row.section_label || row.source_label || null,
    documentTitle: row.source_title || null,
    pageFrom: row.page_from ?? null,
    similarity: Number(row.similarity),
    id: row.id,
    sourceId: row.source_id,
  };
}

/**
 * 사내 지식 통합 검색 (document_chunk + knowledge)
 * ★ match_* RPC는 이 모듈에서만 호출한다.
 *
 * @param {string} query
 * @param {{ companyId: string, matchCount?: number, minSimilarity?: number }} opts
 *   minSimilarity 기본 0.43 — 페이지 단위 조각은 짧아 유사도가 0.5 미만으로 나오는 경우가 많다.
 * @returns {Promise<KnowledgeHit[]>}
 */
export async function searchKnowledge(query, { companyId, matchCount = 5, minSimilarity = 0.43 }) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];
  if (!companyId) throw new Error('companyId가 필요합니다.');

  const embedding = await embedQuery(trimmed);
  const vector = `[${embedding.join(',')}]`;

  const { data, error } = await supabase.rpc('match_all_knowledge', {
    p_company_id: companyId,
    p_embedding: vector,
    p_match_count: matchCount,
    p_min_similarity: minSimilarity,
  });

  if (error) throw new Error(error.message);
  return (data || []).map(normalizeHit);
}

export function formatSourceLabel(hit) {
  const pagePart = hit.pageFrom != null ? ` (${hit.pageFrom}페이지)` : '';
  if (hit.sourceLabel) return `${hit.sourceLabel}${pagePart}`;
  if (hit.documentTitle) return `${hit.documentTitle}${pagePart}`;
  return hit.sourceLabel || hit.documentTitle || '출처 미상';
}
