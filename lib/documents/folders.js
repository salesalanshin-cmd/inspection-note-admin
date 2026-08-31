/**
 * document_folder — 관리자 UI 정리용.
 *
 * ★ AI 검색(knowledgeSearch / match_all_knowledge)은 folder 와 무관하게
 *   company_id 전체 document_chunk 를 대상으로 한다. folder 로 검색 범위를
 *   제한하지 마라.
 */

export const MAX_FOLDER_DEPTH = 3;

/** @param {string|null} folderId @param {Map<string,{parent_id:string|null}>} byId */
export function folderDepth(folderId, byId) {
  if (!folderId) return 0;
  let depth = 0;
  let current = folderId;
  const seen = new Set();
  while (current) {
    if (seen.has(current)) break;
    seen.add(current);
    depth += 1;
    const row = byId.get(current);
    if (!row) break;
    current = row.parent_id;
  }
  return depth;
}

/** 새 폴더 또는 하위 폴더 생성 가능 여부 (최대 3단계) */
export function canCreateUnder(parentId, byId) {
  if (!parentId) return true;
  return folderDepth(parentId, byId) < MAX_FOLDER_DEPTH;
}

/** @param {Array<{id:string,parent_id:string|null,name:string}>} rows */
export function buildFolderTree(rows) {
  const byParent = new Map();
  for (const row of rows) {
    const key = row.parent_id || '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(row);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }
  return byParent;
}

/** 루트 → 현재 폴더 경로 */
export function folderBreadcrumb(folderId, rows) {
  if (!folderId) return [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const path = [];
  let current = folderId;
  const seen = new Set();
  while (current && !seen.has(current)) {
    seen.add(current);
    const row = byId.get(current);
    if (!row) break;
    path.unshift(row);
    current = row.parent_id;
  }
  return path;
}
