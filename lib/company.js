import { supabase } from './supabase';

/**
 * 멀티테넌트 회사 컨텍스트.
 * - 서버: COMPANY_CODE
 * - 클라이언트 번들: NEXT_PUBLIC_COMPANY_CODE (동일 값 권장)
 * ★ api_key 는 어드민 env에 넣지 않는다.
 */

let cachedCompanyId = null;
/** @type {Promise<string>|null} */
let inflight = null;

export function getCompanyCode() {
  return (
    process.env.NEXT_PUBLIC_COMPANY_CODE ||
    process.env.COMPANY_CODE ||
    ''
  ).trim();
}

/**
 * company.code = COMPANY_CODE 인 행의 id.
 * 모듈 레벨 메모리 캐시 — 성공 후 재조회하지 않음.
 */
export async function getCompanyId() {
  if (cachedCompanyId) return cachedCompanyId;
  if (inflight) return inflight;

  inflight = (async () => {
    const code = getCompanyCode();
    if (!code) {
      throw new Error(
        'COMPANY_CODE(또는 NEXT_PUBLIC_COMPANY_CODE)가 설정되지 않았습니다.'
      );
    }

    const { data, error } = await supabase
      .from('company')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data?.id) {
      throw new Error(`회사 코드 '${code}'에 해당하는 company 행이 없습니다.`);
    }

    cachedCompanyId = data.id;
    return cachedCompanyId;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** 키 재발급·회사 전환 등 캐시 무효화가 필요할 때 */
export function clearCompanyIdCache() {
  cachedCompanyId = null;
  inflight = null;
}

/** code 검증: 소문자 영문 + 하이픈만 */
export function isValidCompanyCode(code) {
  return /^[a-z]+(?:-[a-z]+)*$/.test(String(code || '').trim());
}
