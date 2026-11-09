/**
 * 공장 가동 근무일 계산용 공휴일.
 * 사람이 검증한 2026년 목록이다. 디케이메탈 실제 휴무일로 교체 가능.
 */
export const FACTORY_HOLIDAYS_2026 = Object.freeze([
  '2026-06-03', // 지방선거
  '2026-08-17', // 광복절 대체
  '2026-09-24', // 추석
  '2026-09-25', // 추석
  '2026-09-26', // 추석
  '2026-10-05', // 개천절 대체
  '2026-10-09', // 한글날
]);

const HOLIDAY_SET = new Set(FACTORY_HOLIDAYS_2026);

/** YYYY-MM-DD 가 목록에 있으면 true */
export function isFactoryHoliday(ymd) {
  return HOLIDAY_SET.has(String(ymd || '').slice(0, 10));
}
