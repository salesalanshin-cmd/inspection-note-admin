// 관리자용 앱 설정값. 필요에 따라 여기서 숫자만 바꾸면 전체 대시보드/미준수 판정에 반영됩니다.

// 정기 검사(불량/양품 기록) 미준수 판정 기준 - 최근 기록이 이 일수보다 오래되면 "미준수"
export const INSPECTION_CYCLE_DAYS = 7;

// 3정5S 기록 미준수 판정 기준
export const FIVES_CYCLE_DAYS = 7;

// 대시보드 추세 차트에 보여줄 최근 일수
export const TREND_RANGE_DAYS = 14;

/** 초·중·종품 검사 시간대 (근무일 workDate 기준 로컬 시각, 종료 시각은 미포함) */
export const SHIFT_WINDOWS = {
  day: {
    초품: ['08:00', '13:00'],
    중품: ['13:00', '18:00'],
    종품: ['18:00', '20:00'],
  },
  night: {
    초품: ['20:00', '01:00'],
    중품: ['01:00', '05:00'],
    종품: ['05:00', '08:00'],
  },
};

/** 근무일 기준 단계별 일자 오프셋 (getShiftStageWindow 내부용) */
export const SHIFT_STAGE_DAY_OFFSETS = {
  day: {
    초품: { start: 0, end: 0 },
    중품: { start: 0, end: 0 },
    종품: { start: 0, end: 0 },
  },
  night: {
    초품: { start: 0, end: 1 },
    중품: { start: 1, end: 1 },
    종품: { start: 1, end: 1 },
  },
};

export const SHIFT_STAGES = ['초품', '중품', '종품'];

/** 각 검사 시간대 앞뒤로 허용하는 여유 시간(분). 경계에서 살짝 벗어난 사진도 해당 단계로 인정. */
export const STAGE_GRACE_MINUTES = 15;

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

/** 3정5S SOS 오류 코드 (OS 체계) */
export const SOS_ERROR_CODES = {
  OS01: '품목 혼재',
  OS02: '불량품 혼입',
  OS03: '라벨·실물 불일치',
  OS04: '잘못된 자재·부품 사용',
  OS11: '과다 적재',
  OS12: '부족 적재',
  OS13: '표시수량·실수량 불일치',
  OS14: '기준 재고량 미준수',
  OS21: '지정 위치 이탈',
  OS22: '구획선 침범',
  OS23: '사용 후 미복귀',
  OS24: '임시 적치 장기화',
  OS31: '불필요품 방치',
  OS32: '용도 불명품 방치',
  OS33: '장기 미사용품 보관',
  OS34: '폐기 대상품 미처리',
  OS41: '배열 상태 불량',
  OS42: '품목별 구분 미흡',
  OS43: '선입선출 불가',
  OS44: '보관 방법·방향 불량',
  OS51: '바닥 오염',
  OS52: '설비 오염',
  OS53: '작업대·주변 잔재물 방치',
  OS54: '누유·누수 방치',
  OS61: '청결 기준 미설정',
  OS62: '청결 상태 유지 불량',
  OS63: '반복 오염 발생',
  OS64: '청소·점검 기록 미흡',
  OS71: '작업표준·규칙 미준수',
  OS72: '사용 후 원상복귀 미실시',
  OS73: '형식적 정리정돈 활동',
  OS74: '동일 불량 반복 발생',
};

/** SOS 코드 카테고리 (3정5S) */
export const SOS_ERROR_CATEGORIES = {
  정품: ['OS01', 'OS02', 'OS03', 'OS04'],
  정량: ['OS11', 'OS12', 'OS13', 'OS14'],
  정위치: ['OS21', 'OS22', 'OS23', 'OS24'],
  정리: ['OS31', 'OS32', 'OS33', 'OS34'],
  정돈: ['OS41', 'OS42', 'OS43', 'OS44'],
  청소: ['OS51', 'OS52', 'OS53', 'OS54'],
  청결: ['OS61', 'OS62', 'OS63', 'OS64'],
  습관화: ['OS71', 'OS72', 'OS73', 'OS74'],
};

/** 3정5S 구역 코드 */
export const ZONE_CODES = {
  Z01: '1호기',
  Z02: '2호기',
  Z03: '3호기',
  Z04: '4호기',
  Z05: '5호기',
  Z06: '사상 작업장',
  Z07: '가공 작업장',
  Z08: '최종 검사장',
  Z09: '마당',
  Z10: '완제품 창고',
  Z11: '원재료 창고',
  Z12: '기숙사',
  Z13: '사무실',
  Z14: '납품 차량',
  Z15: '야적장',
  Z16: '상차장',
  Z17: '폐기물 보관장',
  Z18: '공용 통로',
};

export function getSosCategoryForCode(code) {
  if (!code) return Object.keys(SOS_ERROR_CATEGORIES)[0];
  for (const [cat, codes] of Object.entries(SOS_ERROR_CATEGORIES)) {
    if (codes.includes(code)) return cat;
  }
  return Object.keys(SOS_ERROR_CATEGORIES)[0];
}

export function getZoneLabel(zoneCode) {
  if (!zoneCode) return '';
  return ZONE_CODES[zoneCode] || zoneCode;
}

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
  return report.sos_error_code || '';
}

export function fivesLabel(report) {
  const zone = report.zone_code && ZONE_CODES[report.zone_code];
  if (zone) return zone;
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
