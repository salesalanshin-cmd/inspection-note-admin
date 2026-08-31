import { isProcessingStatus } from './statusLabels.js';

/**
 * @param {Array<{id:string,supersedes:string|null,folder_id:string|null}>} allDocs
 * @returns {Set<string>} 다른 문서의 supersedes 로 가리켜진(구버전) id
 *
 * 구버전 문서는 삭제하지 않는다. 과거 AI 답변의 근거(source)가 해당 문서일 수 있어
 * "왜 그때 그렇게 답했는지" 추적이 필요하다. is_active=false 로 검색에서 제외하는 것으로 충분하다.
 */
export function buildSupersededIds(allDocs) {
  const ids = new Set();
  for (const doc of allDocs || []) {
    if (doc.supersedes) ids.add(doc.supersedes);
  }
  return ids;
}

/**
 * @param {object} doc
 * @param {Set<string>} supersededIds
 * @param {{ showProcessing:boolean, showFailed:boolean, showInactive:boolean, showOldVersions:boolean }} toggles
 */
export function matchesDocumentFilter(doc, supersededIds, toggles) {
  const isOldVersion = supersededIds.has(doc.id);
  const isDefaultReady =
    doc.is_active && doc.status === 'ready' && !isOldVersion;

  if (isDefaultReady) return true;
  if (toggles.showProcessing && isProcessingStatus(doc.status)) return true;
  if (toggles.showFailed && doc.status === 'failed') return true;
  if (toggles.showInactive && !doc.is_active) return true;
  if (toggles.showOldVersions && isOldVersion) return true;
  return false;
}

export function countByFilter(allDocs, supersededIds) {
  let processing = 0;
  let failed = 0;
  let inactive = 0;
  let oldVersions = 0;
  let unfoldered = 0;
  for (const doc of allDocs || []) {
    if (isProcessingStatus(doc.status)) processing += 1;
    if (doc.status === 'failed') failed += 1;
    if (!doc.is_active) inactive += 1;
    if (supersededIds.has(doc.id)) oldVersions += 1;
    if (doc.folder_id == null) unfoldered += 1;
  }
  return { processing, failed, inactive, oldVersions, unfoldered };
}
