export const STATUS_LABELS = {
  pending: '대기',
  extracting: '텍스트 추출 중',
  chunking: '조각 분할 중',
  embedding: '임베딩 중',
  ready: '완료',
  failed: '실패',
};

export const ISSUE_LABELS = {
  empty_text: '빈 텍스트 (스캔본 의심)',
  table_suspected: '표 깨짐 의심',
};

export function isProcessingStatus(status) {
  return ['pending', 'extracting', 'chunking', 'embedding'].includes(status);
}
