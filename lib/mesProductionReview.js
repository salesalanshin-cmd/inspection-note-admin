import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServiceRoleClient } from './supabaseAdmin';

const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');

export async function fetchMesReview(request) {
  const {data,error} = await createServiceRoleClient().from('mes_production_review_access')
    .select('signing_key,base_url').eq('company_code','dkmetal').single();
  const secret = data?.signing_key;
  if (error || !data?.base_url || !secret || Buffer.byteLength(secret) < 32) {
    throw new Error('관리자 서버의 MES 연결 설정을 확인해주세요.');
  }
  const url = new URL(data.base_url);
  url.pathname = url.pathname.replace(/\/+$/, '') + '/api/mobile-materials/production-review';
  const time = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const sign = (domain, payload) => createHmac('sha256', secret)
    .update(['production', time, nonce, domain, hash(payload)].join('\n')).digest('hex');
  const payload = JSON.stringify(request);
  const response = await fetch(url, {
    method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', 'X-Worker-Sync-Time': time, 'X-Worker-Sync-Nonce': nonce,
      'X-Worker-Sync-Signature': sign('production-review-v1', payload) },
    body: JSON.stringify({ payload }),
  });
  if (!response.ok) {
    const err = new Error(response.status === 409 ? '다른 변경이 반영됐습니다. 다시 조회해주세요.' :
      response.status === 400 ? '조회 조건 또는 정정 내용을 확인해주세요.' : 'MES 처리 결과를 확인할 수 없습니다. 다시 조회해주세요.');
    err.status = response.status;
    throw err;
  }
  const result = await response.json();
  const receipt = response.headers.get('X-Production-Review-Receipt') || '';
  if (typeof result.payload !== 'string' || !/^[0-9a-f]{64}$/.test(receipt) ||
    !timingSafeEqual(Buffer.from(receipt, 'hex'), Buffer.from(sign('production-review-response-v1', result.payload), 'hex'))) {
    throw new Error('MES 응답 서명을 확인할 수 없습니다.');
  }
  return JSON.parse(result.payload);
}
