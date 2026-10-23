/**
 * 메일/진단용 env 헬퍼 (비밀 값은 반환하지 않음).
 * env: RESEND_API_KEY, MAIL_FROM, CRON_SECRET, VERCEL_ENV
 */

/** trim 후 비어 있지 않으면 true. 값은 반환하지 않음. */
export function isEnvSet(value) {
  if (value == null) return false;
  return String(value).trim().length > 0;
}

/**
 * 메일 발송에 필요한 env 중 비어 있는 키 목록 (trim 기준).
 * @returns {('RESEND_API_KEY'|'MAIL_FROM')[]}
 */
export function getMissingMailEnvKeys(env = process.env) {
  const missing = [];
  if (!isEnvSet(env.RESEND_API_KEY)) missing.push('RESEND_API_KEY');
  if (!isEnvSet(env.MAIL_FROM)) missing.push('MAIL_FROM');
  return missing;
}

/** 예: "RESEND_API_KEY 없음" / "RESEND_API_KEY 없음 / MAIL_FROM 없음" — 값은 포함하지 않음 */
export function formatMailMissingError(missingKeys) {
  return missingKeys.map((k) => `${k} 없음`).join(' / ');
}

export function isMailEnabled(env = process.env) {
  return getMissingMailEnvKeys(env).length === 0;
}

/**
 * 진단용: 설정 여부만 (값은 절대 포함하지 않음).
 * @returns {{ RESEND_API_KEY: '설정됨'|'없음', MAIL_FROM: '설정됨'|'없음', CRON_SECRET: '설정됨'|'없음', VERCEL_ENV: string|null }}
 */
export function getMailEnvDiagnostics(env = process.env) {
  return {
    RESEND_API_KEY: isEnvSet(env.RESEND_API_KEY) ? '설정됨' : '없음',
    MAIL_FROM: isEnvSet(env.MAIL_FROM) ? '설정됨' : '없음',
    CRON_SECRET: isEnvSet(env.CRON_SECRET) ? '설정됨' : '없음',
    VERCEL_ENV:
      env.VERCEL_ENV != null && String(env.VERCEL_ENV) !== ''
        ? String(env.VERCEL_ENV)
        : null,
  };
}
