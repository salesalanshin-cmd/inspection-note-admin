/**
 * Edge Runtime(middleware)용 세션 검증 — Web Crypto API 사용
 * generateSessionToken()과 동일한 HMAC-SHA256(secret, password) hex 출력
 */

export { SESSION_COOKIE_NAME } from './session.constants';

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateSessionTokenEdge() {
  const secret = process.env.SESSION_SECRET;
  const password = process.env.ADMIN_PASSWORD;
  if (!secret || !password) return null;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(password));
  return toHex(signature);
}

export async function isValidSessionEdge(token) {
  if (!token || typeof token !== 'string') return false;
  const expected = await generateSessionTokenEdge();
  if (!expected) return false;
  if (token.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < token.length; i += 1) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
