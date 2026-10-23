import { NextResponse } from 'next/server';
import { getMailEnvDiagnostics } from '../../../../lib/attendance/mailEnv';
import {
  isValidSession,
  SESSION_COOKIE_NAME,
} from '../../../../lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/diagnostics/mail-env
 * 관리자 세션 필요. RESEND_API_KEY / MAIL_FROM / CRON_SECRET 설정 여부 + VERCEL_ENV.
 * 비밀 값은 절대 반환하지 않음.
 */
export async function GET(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!isValidSession(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(getMailEnvDiagnostics());
}
