import { createClient } from '@supabase/supabase-js';

/**
 * 서버 전용 Supabase 클라이언트 (service role).
 * 키를 로그·클라이언트에 노출하지 말 것.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error('Supabase service role credentials not configured');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
