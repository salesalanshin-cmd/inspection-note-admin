import { normalizeProcessHint } from './processHint.js';

/**
 * MC 계열 제안이 high가 아니거나 processHint가 주조/사상이면 needsReview.
 * 코드·confidence는 유지한다.
 *
 * @param {{ code?: string|null, confidence?: string|null, needsReview?: boolean }} result
 * @param {string|null|undefined} processHint
 * @returns {{ needsReview: boolean }}
 */
export function resolveMcNeedsReview(result, processHint) {
  const code = result?.code == null ? '' : String(result.code).trim();
  if (!code.startsWith('MC')) {
    return { needsReview: result?.needsReview === true };
  }

  const hint = normalizeProcessHint(processHint);
  const notHigh = result?.confidence !== 'high';
  const castingOrGrind = hint === '주조' || hint === '사상';
  if (notHigh || castingOrGrind) {
    return { needsReview: true };
  }
  return { needsReview: result?.needsReview === true };
}

/**
 * @template T
 * @param {T & { code?: string|null, confidence?: string|null }} result
 * @param {string|null|undefined} processHint
 * @returns {T & { needsReview: boolean }}
 */
export function applyMcNeedsReview(result, processHint) {
  const { needsReview } = resolveMcNeedsReview(result, processHint);
  return { ...result, needsReview };
}
