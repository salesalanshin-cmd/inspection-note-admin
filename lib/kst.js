/** 한국 표준시 UTC+9. 서버/브라우저 로컬 타임존과 무관하게 근무일을 계산할 때 사용합니다. */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * UTC 시각에 +9h 한 Date. 이 객체에는 반드시 getUTC* 게터만 쓰세요.
 * (로컬 게터는 프로세스 타임존이 한 번 더 적용됩니다.)
 */
export function toKstDate(date) {
  const utc = new Date(date).getTime();
  return new Date(utc + KST_OFFSET_MS);
}

export function getKstHours(date) {
  return toKstDate(date).getUTCHours();
}

export function getKstMinutes(date) {
  return toKstDate(date).getUTCMinutes();
}

export function getKstSeconds(date) {
  return toKstDate(date).getUTCSeconds();
}

export function getKstDateParts(date) {
  const k = toKstDate(date);
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth(),
    day: k.getUTCDate(),
  };
}

/** 0=일 … 6=토 (KST 달력) */
export function getKstDay(date) {
  return toKstDate(date).getUTCDay();
}

/** KST 벽시계 → UTC Date */
export function kstWallToUtc(year, month, day, hours = 0, minutes = 0, seconds = 0, ms = 0) {
  return new Date(Date.UTC(year, month, day, hours, minutes, seconds, ms) - KST_OFFSET_MS);
}

/** 해당 시각이 속한 KST 달력일 00:00:00 */
export function startOfKstDay(date) {
  const { year, month, day } = getKstDateParts(date);
  return kstWallToUtc(year, month, day, 0, 0, 0, 0);
}

/** KST 달력일 기준으로 날짜를 이동합니다. 결과는 그날 KST 00:00입니다. */
export function addKstDays(date, days) {
  return new Date(startOfKstDay(date).getTime() + days * MS_PER_DAY);
}

export function formatKstISODate(date) {
  const { year, month, day } = getKstDateParts(date);
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function kstMinutesFromMidnight(date) {
  return getKstHours(date) * 60 + getKstMinutes(date);
}

export { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE };
