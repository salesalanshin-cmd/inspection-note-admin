/** Vercel Cron / 수동 트리거 공통 인증 */
export function authorizeCron(request) {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return false;

  const auth = request.headers.get('authorization') || '';
  if (auth === `Bearer ${secret}`) return true;

  const headerSecret = request.headers.get('x-cron-secret') || '';
  if (headerSecret === secret) return true;

  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret') || url.searchParams.get('CRON_SECRET');
  if (querySecret === secret) return true;

  return false;
}
