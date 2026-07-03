import { createHmac, timingSafeEqual } from 'crypto';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE } from './session.constants';

export { SESSION_COOKIE_NAME, SESSION_MAX_AGE };

function getEnv() {
  const secret = process.env.SESSION_SECRET;
  const password = process.env.ADMIN_PASSWORD;
  if (!secret || !password) return null;
  return { secret, password };
}

/** ADMIN_PASSWORD를 SESSION_SECRET으로 HMAC 서명한 세션 토큰 (Node API용) */
export function generateSessionToken() {
  const env = getEnv();
  if (!env) {
    throw new Error('SESSION_SECRET 또는 ADMIN_PASSWORD가 설정되지 않았습니다.');
  }
  return createHmac('sha256', env.secret).update(env.password).digest('hex');
}

/** 쿠키 토큰이 유효한지 확인 (Node API용) */
export function isValidSession(token) {
  if (!token || typeof token !== 'string') return false;
  try {
    const expected = generateSessionToken();
    const a = Buffer.from(token, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** 비밀번호 비교 (타이밍 공격 방지) */
export function safeEqualPassword(input, expected) {
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
