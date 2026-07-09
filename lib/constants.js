// 관리자용 앱 설정값. 필요에 따라 여기서 숫자만 바꾸면 전체 대시보드/미준수 판정에 반영됩니다.

// 정기 검사(불량/양품 기록) 미준수 판정 기준 - 최근 기록이 이 일수보다 오래되면 "미준수"
export const INSPECTION_CYCLE_DAYS = 7;

// 3정5S 기록 미준수 판정 기준
export const FIVES_CYCLE_DAYS = 7;

// 대시보드 추세 차트에 보여줄 최근 일수
export const TREND_RANGE_DAYS = 14;

/** 초·중·종품 검사 시간대 (근무일 기준 로컬 시각) */
export const SHIFT_WINDOWS = {
  day: {
    초품: ['08:00', '09:00'],
    중품: ['13:00', '14:00'],
    종품: ['18:00', '19:00'],
  },
  night: {
    초품: ['20:00', '21:00'],
    중품: ['01:00', '02:00'],
    종품: ['05:00', '06:00'],
  },
};

export const SHIFT_STAGES = ['초품', '중품', '종품'];

/**
 * defect_stage → 초·중·종품 정규화
 * Supabase 실측: '주조'|'사상'|'가공' (공정명으로 저장된 경우 포함)
 */
export const DEFECT_STAGE_MAP = {
  초품: '초품',
  중품: '중품',
  종품: '종품',
  initial: '초품',
  middle: '중품',
  final: '종품',
  first: '초품',
  mid: '중품',
  last: '종품',
  주조: '초품',
  사상: '중품',
  가공: '종품',
};

export function normalizeDefectStage(stage) {
  if (!stage) return null;
  return DEFECT_STAGE_MAP[stage] ?? DEFECT_STAGE_MAP[stage.trim()] ?? null;
}

// 알려진 불량 코드 -> 한글 라벨 (없는 코드는 defect_type 값을 그대로 사용)
export const DEFECT_CODE_LABELS = {
  A001: '결육',
  A002: '소착',
  A003: '미성형',
  A004: '긁힘',
  A005: '밀핀',
  A006: '내부이물질',
  A007: '외관박리',
  A008: '외부오염',
  A009: '찍힘',
  A010: '기포',
  A01A: '변형',
  A011: '금형파손',
  A012: '제품크랙',
  A013: '예열타',
  GR001: '미사상',
  GR002: '과사상',
  GR003: '외부오염',
  GR004: '찍힘',
  MC001: '치수불량',
  MC002: '미가공',
  MC003: '조도불량',
  MC004: '공구파손',
  MC005: '세팅용',
};

/** 문서스캔 DOC 오류 코드 */
export const DOC_ERROR_CODES = {
  'DOC-001': '항목 누락',
  'DOC-002': '식별 불가',
  'DOC-003': '사진 불량',
  'DOC-004': '촬영 불량',
  'DOC-005': '해상도 부족',
  'DOC-006': '입력 오류',
  'DOC-007': '수정 흔적',
  'DOC-999': '기타',
};

export const DOC_ERROR_DESCRIPTIONS = {
  'DOC-001': '필수 항목이 비어 있음',
  'DOC-002': '글씨 또는 숫자를 판독할 수 없음',
  'DOC-003': '흔들림, 초점불량, 역광 등으로 확인 불가',
  'DOC-004': '문서 일부가 잘렸거나 전체가 촬영되지 않음',
  'DOC-005': '확대해도 내용을 확인할 수 없음',
  'DOC-006': '실제 정보와 다르거나 잘못 기입됨',
  'DOC-007': '임의 수정, 덧쓰기, 지움 등 신뢰성 저하',
  'DOC-999': '',
};

/** 3정5S SOS 오류 코드 */
export const SOS_ERROR_CODES = {
  'SOS-001': '정위치 불량',
  'SOS-002': '불필요품 방치',
  'SOS-003': '혼재',
  'SOS-004': '적치 불량',
  'SOS-005': '표시 불량',
  'SOS-006': '오염',
  'SOS-007': '누유·누수',
  'SOS-008': '안전 위험',
  'SOS-009': '시설 이상',
  'SOS-010': '사진 불량',
  'SOS-999': '기타',
};

export const SOS_ERROR_DESCRIPTIONS = {
  'SOS-001': '지정 위치가 아님',
  'SOS-002': '필요 없는 물품 존재',
  'SOS-003': '서로 다른 품목이 섞여 있음',
  'SOS-004': '적재 방법 또는 수량 기준 미준수',
  'SOS-005': '라벨, 구역표시, 식별표시 미흡',
  'SOS-006': '기름, 물, 분진, 스크랩 등 오염 존재',
  'SOS-007': '기름, 냉각수, 에어 등 누출 발생',
  'SOS-008': '통로 막힘, 전선 방치, 낙하·미끄럼 등 위험요소',
  'SOS-009': '장비, 치공구, 보관설비 등의 이상 상태',
  'SOS-010': '판정이 어려울 정도의 촬영 품질 불량',
  'SOS-999': '',
};

/** Claude Vision 분류 모델 (정확도 이슈 시 sonnet으로 교체) */
export const CLASSIFY_MODEL = 'claude-haiku-4-5-20251001';

/** 인사이트 랩 AI 채팅 모델 */
export const INSIGHT_LAB_MODEL = 'claude-haiku-4-5-20251001';

/** @deprecated INSIGHT_LAB_MODEL 사용 */
export const AI_CONSOLE_MODEL = INSIGHT_LAB_MODEL;

export const CONFIDENCE_LABELS = {
  high: '높음',
  medium: '보통',
  low: '낮음',
};

export function getCodeSetCodes(codeSet) {
  if (codeSet === 'sos') return Object.keys(SOS_ERROR_CODES);
  if (codeSet === 'doc') return Object.keys(DOC_ERROR_CODES);
  return Object.keys(DEFECT_CODE_LABELS);
}

export function getCodeLabel(codeSet, code) {
  if (!code) return '';
  if (codeSet === 'sos') return SOS_ERROR_CODES[code] || code;
  if (codeSet === 'doc') return DOC_ERROR_CODES[code] || code;
  return DEFECT_CODE_LABELS[code] || code;
}

export function docLabel(report) {
  if (report.doc_error_code && DOC_ERROR_CODES[report.doc_error_code]) {
    return DOC_ERROR_CODES[report.doc_error_code];
  }
  return report.doc_title || report.doc_type || '문서';
}

export function fivesErrorCode(report) {
  return report.sos_error_code || report.sos_code || '';
}

export function fivesLabel(report) {
  const code = fivesErrorCode(report);
  if (code && SOS_ERROR_CODES[code]) return SOS_ERROR_CODES[code];
  return report.area_type || '3정5S';
}

export function defectLabel(report) {
  if (report.defect_code && DEFECT_CODE_LABELS[report.defect_code]) {
    return DEFECT_CODE_LABELS[report.defect_code];
  }
  return report.defect_type || report.defect_code || '미분류';
}
