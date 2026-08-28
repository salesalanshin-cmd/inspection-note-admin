/** 대략적 토큰 수 (한·영 혼합 문서용 근사) */
export function estimateTokens(text) {
  if (!text) return 0;
  const normalized = String(text).trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 3.5));
}

export function takeTokenTail(text, tokenCount) {
  if (!text || tokenCount <= 0) return '';
  const approxChars = Math.ceil(tokenCount * 3.5);
  return text.slice(-approxChars);
}

export function takeTokenHead(text, tokenCount) {
  if (!text || tokenCount <= 0) return '';
  const approxChars = Math.ceil(tokenCount * 3.5);
  return text.slice(0, approxChars);
}
