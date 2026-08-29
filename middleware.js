import { NextResponse } from 'next/server';
import { isValidSessionEdge, SESSION_COOKIE_NAME } from './lib/session.edge';

const PUBLIC_PATHS = ['/login', '/api/login', '/api/logout'];

function isPublicPath(pathname) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  // 앱 /api/ask — 라우트 내부에서 세션 또는 x-company-key 검증
  if (pathname === '/api/ask' || pathname.startsWith('/api/ask/')) return true;
  // Vercel Cron — 라우트 내부에서 CRON_SECRET 검증
  if (pathname.startsWith('/api/cron')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/i.test(pathname)) return true;
  return false;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = await isValidSessionEdge(token);

  if (!valid) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
