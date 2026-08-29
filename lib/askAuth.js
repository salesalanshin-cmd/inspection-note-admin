import { supabase } from './supabase.js';
import { isValidSession, SESSION_COOKIE_NAME } from './session.js';
import { getCompanyId } from './company.js';

/**
 * /api/ask 인증 — 어드민 세션 또는 앱 x-company-key
 *
 * x-company-key는 company.api_key와 대조한다.
 * ★ api_key는 APK에서 추출 가능하다. 완전한 보안이 아니라
 *   업체 간 데이터 혼입을 막는 격리 장치다.
 *
 * @returns {Promise<{ companyId: string, authMethod: 'session'|'api_key' }|null>}
 */
export async function resolveAskAuth(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (isValidSession(token)) {
    const companyId = await getCompanyId();
    return { companyId, authMethod: 'session' };
  }

  const apiKey = request.headers.get('x-company-key')?.trim();
  if (!apiKey) return null;

  const { data, error } = await supabase
    .from('company')
    .select('id')
    .eq('api_key', apiKey)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data?.id) return null;
  return { companyId: data.id, authMethod: 'api_key' };
}
