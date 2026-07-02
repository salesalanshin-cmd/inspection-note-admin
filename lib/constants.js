// 관리자용 앱 설정값. 필요에 따라 여기서 숫자만 바꾸면 전체 대시보드/미준수 판정에 반영됩니다.

// 정기 검사(불량/양품 기록) 미준수 판정 기준 - 최근 기록이 이 일수보다 오래되면 "미준수"
export const INSPECTION_CYCLE_DAYS = 7;

// 3정5S 기록 미준수 판정 기준
export const FIVES_CYCLE_DAYS = 7;

// 대시보드 추세 차트에 보여줄 최근 일수
export const TREND_RANGE_DAYS = 14;

// 알려진 불량 코드 -> 한글 라벨 (없는 코드는 defect_type 값을 그대로 사용)
export const DEFECT_CODE_LABELS = {
  A001: '결육',
  A002: '소착',
  GR001: '미사상',
  MC001: '치수불량',
};

export function defectLabel(report) {
  if (report.defect_code && DEFECT_CODE_LABELS[report.defect_code]) {
    return DEFECT_CODE_LABELS[report.defect_code];
  }
  return report.defect_type || report.defect_code || '미분류';
}
