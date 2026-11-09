/**
 * 작업일보 sheet_worker / uploader 이름을 worker_directory 에 맞춘다.
 * 한글 음절(코드 포인트) 편집거리 1 + 후보 1명일 때만 교정한다.
 */

function splitNames(value) {
  return String(value ?? '')
    .split(/[,，]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

/** 한글 음절 단위 레벤슈타인 거리. */
export function hangulEditDistance(a, b) {
  const s = [...String(a ?? '')];
  const t = [...String(b ?? '')];
  const n = s.length;
  const m = t.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const prev = new Array(m + 1);
  const curr = new Array(m + 1);
  for (let j = 0; j <= m; j += 1) prev[j] = j;
  for (let i = 1; i <= n; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= m; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= m; j += 1) prev[j] = curr[j];
  }
  return prev[m];
}

/**
 * @param {Array<{ worker_name?: string, process?: string|null, removed?: boolean, excluded?: boolean }>} directory
 */
export function buildWorkerNameIndex(directory) {
  /** @type {Map<string, { worker_name: string, process: string|null }>} */
  const byName = new Map();
  const names = [];
  for (const row of directory || []) {
    if (row?.removed === true || row?.excluded === true) continue;
    const worker_name = String(row.worker_name || '').trim();
    if (!worker_name) continue;
    const process = row.process == null || String(row.process).trim() === ''
      ? null
      : String(row.process).trim();
    const entry = { worker_name, process };
    byName.set(worker_name, entry);
    names.push(entry);
  }
  return { byName, names };
}

/**
 * 정확 일치, 또는 음절 길이가 같고 편집거리 1(한 글자 치환)이며 후보가 하나뿐일 때.
 * 길이 다른 삽입/삭제(예: 이다미영→이미영)는 매칭하지 않는다.
 * @returns {{ worker_name: string, process: string|null }|null}
 */
export function matchWorkerName(rawName, index) {
  const raw = String(rawName || '').trim();
  if (!raw || !index) return null;
  const exact = index.byName.get(raw);
  if (exact) return exact;
  const rawChars = [...raw];
  const candidates = [];
  for (const entry of index.names) {
    const nameChars = [...entry.worker_name];
    if (nameChars.length !== rawChars.length) continue;
    if (hangulEditDistance(raw, entry.worker_name) === 1) candidates.push(entry);
  }
  if (candidates.length === 1) return candidates[0];
  return null;
}

/**
 * @returns {Array<{ raw: string, name: string|null, process: string|null }>}
 */
export function matchSheetWorkers(sheetWorker, index) {
  return splitNames(sheetWorker).map((raw) => {
    const hit = matchWorkerName(raw, index);
    return {
      raw,
      name: hit ? hit.worker_name : null,
      process: hit ? hit.process : null,
    };
  });
}

export function matchUploader(uploaderName, index) {
  const raw = String(uploaderName || '').trim();
  if (!raw) return null;
  const hit = matchWorkerName(raw, index);
  if (!hit) return { raw, name: null, process: null };
  return { raw, name: hit.worker_name, process: hit.process };
}

/** 집계용 이름: 매칭되면 정규화명, 아니면 원문. */
export function namesFromMatchedWorkers(matchedWorkers, fallbackText = '') {
  if (Array.isArray(matchedWorkers) && matchedWorkers.length) {
    return matchedWorkers
      .map((item) => String(item?.name || item?.raw || '').trim())
      .filter(Boolean);
  }
  return splitNames(fallbackText);
}
