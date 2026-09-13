import { NextResponse } from 'next/server';
import { isValidSessionEdge, SESSION_COOKIE_NAME } from './lib/session.edge';

const PUBLIC_PATHS = ['/login', '/api/login', '/api/logout'];

/**
 * trailing slash 정규화: /api/push/send/ → /api/push/send
 */
function normalizePath(pathname) {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

function isPublicPath(pathname) {
  const path = normalizePath(pathname);

  if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    return true;
  }

  // 앱 API — 라우트 내부에서 세션 또는 x-company-key 검증
  // ★ /api/ask 와 동일한 startsWith 패턴 (정확한 일치만 쓰지 않음)
  if (path === '/api/ask' || path.startsWith('/api/ask/')) return true;
  if (path === '/api/push' || path.startsWith('/api/push/')) return true;
  if (path === '/api/defects' || path.startsWith('/api/defects/')) return true;

  // 앱 관리자 답변
  if (/^\/api\/questions\/[^/]+\/answer$/.test(path)) return true;

  // Vercel Cron — 라우트 내부에서 CRON_SECRET 검증
  if (path.startsWith('/api/cron')) return true;
  if (path.startsWith('/_next')) return true;
  if (path.startsWith('/favicon')) return true;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/i.test(path)) return true;
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
    // API는 로그인 페이지로 307 하면 앱이 /login 405를 받음 → JSON 401
    if (normalizePath(pathname).startsWith('/api/')) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
