import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const TABLE = 'mes_worker_sync_pending';
const fields = 'worker_name,environment,change_id,attempted_at';
const routes = {
  production: '/api/mobile-materials/workers/person/sync',
  development: '/api/mobile-materials-dev/workers/person/sync',
};

function digest(secret, parts) {
  return createHmac('sha256', secret).update(parts.join('\n'), 'utf8').digest('hex');
}

export async function sendWorkerSync({ worker_name: name, environment }, options = {}) {
  const config = options.env || process.env;
  const secret = config.MES_WORKER_SYNC_SECRET;
  const base = environment === 'development'
    ? config.MES_WORKER_SYNC_DEV_BASE_URL || config.MES_WORKER_SYNC_BASE_URL
    : config.MES_WORKER_SYNC_BASE_URL;
  if (!base || !secret || Buffer.byteLength(secret, 'utf8') < 32 || !Object.hasOwn(routes, environment)) {
    throw new Error('관리자 웹의 MES 작업자 연동 설정을 확인하세요.');
  }
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('MES 서버 주소 설정을 확인하세요.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') + routes[environment];
  const time = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const signatureFields = [environment, time, nonce, name];
  const response = await (options.fetch || fetch)(url, {
    method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(18000),
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Sync-Time': time, 'X-Worker-Sync-Nonce': nonce,
      'X-Worker-Sync-Signature': digest(secret, signatureFields),
    },
    body: JSON.stringify({ workerName: name }),
  }).catch(() => { throw new Error('MES 서버 응답을 받지 못했습니다. 연결 상태를 확인한 뒤 재시도하세요.'); });
  if (!response.ok) throw new Error(`MES 연동 요청을 확인하세요 (HTTP ${response.status}).`);
  const receipt = await response.json();
  const proof = response.headers.get('X-Worker-Sync-Receipt');
  if (receipt?.workerName !== name || typeof receipt.active !== 'boolean' ||
      ((receipt.active || receipt.personCode != null) && !/^DKP-[0-9A-F]{16}$/.test(receipt.personCode)) ||
      !/^[a-f0-9]{64}$/.test(proof || '')) throw new Error('MES 처리 결과를 확인할 수 없습니다.');
  const expected = digest(secret, ['receipt', ...signatureFields, receipt.active ? '1' : '0', receipt.personCode ?? '']);
  if (!timingSafeEqual(Buffer.from(proof, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new Error('MES 처리 결과 서명을 확인할 수 없습니다.');
  }
}

export async function listPending(db, companyId, { name, untouched = false, limit = 50 } = {}) {
  let query = db.from(TABLE).select(fields, { count: 'exact' }).eq('company_id', companyId);
  if (name !== undefined) query = query.eq('worker_name', name);
  if (untouched) query = query.is('attempted_at', null);
  const { data, error, count } = await query.order('changed_at').order('worker_name').order('environment').limit(limit);
  if (error) throw new Error('MES 연동 대기 목록을 불러올 수 없습니다. Supabase 마이그레이션과 관리자 서버 설정을 확인하세요.');
  return { rows: data, count };
}

export async function deliverPending(db, companyId, row, manual, send = sendWorkerSync) {
  // A stopped or timed-out request may already have committed in MES.
  // Only an explicit retry can reclaim an attempted revision after the request window.
  if (row.attempted_at) {
    if (!manual) return;
    if (Date.now() - Date.parse(row.attempted_at) < 25000) {
      throw new Error('직전 요청의 처리 결과를 확인 중입니다. 잠시 후 재시도하세요.');
    }
  }
  const match = (query) => query.eq('company_id', companyId).eq('worker_name', row.worker_name)
    .eq('environment', row.environment).eq('change_id', row.change_id);
  const attempt = new Date().toISOString();
  let claim = match(db.from(TABLE).update({ attempted_at: attempt }));
  claim = row.attempted_at ? claim.eq('attempted_at', row.attempted_at) : claim.is('attempted_at', null);
  const { data, error } = await claim.select('change_id').maybeSingle();
  if (error) throw new Error('MES 연동 요청 상태를 저장하지 못했습니다.');
  if (!data) return;
  await send(row);
  const acknowledged = await match(db.from(TABLE).delete()).eq('attempted_at', attempt);
  if (acknowledged.error) throw new Error('MES 처리 결과를 대기 목록에 반영하지 못했습니다.');
}
