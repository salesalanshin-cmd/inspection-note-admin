/**
 * @param {string|null} prevKey
 * @param {'asc'|'desc'} prevDir
 * @param {string} key
 * @returns {{ key: string, dir: 'asc'|'desc' }}
 */
export function toggleSortKey(prevKey, prevDir, key) {
  if (prevKey === key) {
    return { key, dir: prevDir === 'asc' ? 'desc' : 'asc' };
  }
  return { key, dir: 'asc' };
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) && Number.isNaN(b)) return 0;
    return a - b;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return Number(a) - Number(b);
  }
  return String(a).localeCompare(String(b), 'ko');
}

/**
 * @template T
 * @param {T[]} rows
 * @param {string} key
 * @param {'asc'|'desc'} dir
 * @param {(row: T, key: string) => unknown} getValue
 */
export function sortRows(rows, key, dir, getValue) {
  const mul = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => compareValues(getValue(a, key), getValue(b, key)) * mul);
}
