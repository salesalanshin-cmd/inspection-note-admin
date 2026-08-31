export const SOURCE_TYPES = ['doc', 'manager_answer', 'case'];

export const SOURCE_TYPE_LABELS = {
  doc: '문서',
  manager_answer: '관리자 답변',
  case: '사례',
};

const UNUSED_DAYS = 90;
const REVIEW_MIN_VOTES = 5;

export function isKnowledgeUnused(lastHitAt) {
  if (!lastHitAt) return true;
  const hit = new Date(lastHitAt);
  if (Number.isNaN(hit.getTime())) return true;
  const days = (Date.now() - hit.getTime()) / 86400000;
  return days >= UNUSED_DAYS;
}

export function needsKnowledgeReview(helpfulCount, unhelpfulCount) {
  const helpful = helpfulCount ?? 0;
  const unhelpful = unhelpfulCount ?? 0;
  const total = helpful + unhelpful;
  return total >= REVIEW_MIN_VOTES && unhelpful > helpful;
}

export function previewText(text, max = 80) {
  const s = String(text || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}
