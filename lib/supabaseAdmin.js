import { createClient } from '@supabase/supabase-js';

/**
 * 서버 전용 Supabase 클라이언트 (service role).
 * 키를 로그·클라이언트에 노출하지 말 것.
 *
 * 모듈 싱글톤: persistSession/autoRefresh 비활성 service role은 요청 스코프
 * 상태를 갖지 않아 서버리스 인스턴스 재사용이 안전하다. (RLS 우회 키이므로
 * 클라이언트 번들에 넣지 않는다.)
 */
let cachedServiceRoleClient = null;

export function createServiceRoleClient() {
  if (cachedServiceRoleClient) return cachedServiceRoleClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error('Supabase service role credentials not configured');
  }
  cachedServiceRoleClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedServiceRoleClient;
}
