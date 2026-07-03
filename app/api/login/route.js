import { NextResponse } from 'next/server';
import {
  generateSessionToken,
  safeEqualPassword,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from '../../../lib/session';

export async function POST(request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!adminPassword || !sessionSecret) {
    return NextResponse.json(
      { ok: false, error: '서버 인증 설정이 완료되지 않았습니다.' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
  }

  const { password } = body;
  if (typeof password !== 'string') {
    return NextResponse.json({ ok: false, error: '비밀번호를 입력해 주세요.' }, { status: 400 });
  }

  if (!safeEqualPassword(password, adminPassword)) {
    return NextResponse.json(
      { ok: false, error: '비밀번호가 올바르지 않습니다' },
      { status: 401 }
    );
  }

  const token = generateSessionToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });

  return response;
}
