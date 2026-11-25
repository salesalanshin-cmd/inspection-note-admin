import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { sendWorkerSync, deliverPending } from '../lib/mesWorkerSync.js';

const env = { MES_WORKER_SYNC_BASE_URL: 'http://example.test', MES_WORKER_SYNC_SECRET: 'x'.repeat(32) };
const name = '작업자 MOBILE';
function signingServer(target, active, tamper = false) {
  return async (url, options) => {
    const base = target === 'development' ? 'mobile-materials-dev' : 'mobile-materials';
    assert.equal(url.pathname, `/api/${base}/workers/person/sync`);
    assert.deepEqual(JSON.parse(options.body), { workerName: name });
    assert.equal(options.redirect, 'error');
    const h = options.headers;
    const fields = [target, h['X-Worker-Sync-Time'], h['X-Worker-Sync-Nonce'], name];
    const mac = parts => createHmac('sha256', env.MES_WORKER_SYNC_SECRET).update(parts.join('\n')).digest('hex');
    assert.equal(h['X-Worker-Sync-Signature'], mac(fields));
    const personCode = active ? 'DKP-0123456789ABCDEF' : null;
    const signed = mac(['receipt', ...fields, active ? '1' : '0', personCode ?? '']);
    return Response.json({ workerName: name, active, personCode }, {
      headers: { 'X-Worker-Sync-Receipt': tamper ? 'e'.repeat(64) : signed },
    });
  };
}

test('verifies environment-specific signatures for activation and deactivation; rejects forged HTTP receipt', async () => {
  for (const target of ['development', 'production']) {
    for (const active of [true, false]) {
      await sendWorkerSync({ worker_name: name, environment: target }, { env, fetch: signingServer(target, active) });
    }
    await assert.rejects(sendWorkerSync({ worker_name: name, environment: target },
      { env, fetch: signingServer(target, true, true) }), /서명/);
  }
});

function queueFixture() {
  const row = { company_id: 'dk', worker_name: name, environment: 'production', change_id: '1', attempted_at: null };
  let stored = { ...row };
  return {
    row, read: () => stored, replace: () => { stored = { ...row, change_id: '2' }; },
    db: { from: () => {
      const filters = [];
      let patch;
      const matches = () => stored && filters.every(([k, v]) => stored[k] === v);
      const query = {
        update(values) { patch = values; return query; }, delete() { return query; },
        is(k, v) { return query.eq(k, v); }, eq(k, v) { filters.push([k, v]); return query; },
        select() { return query; },
        async maybeSingle() {
          if (!matches()) return { data: null };
          Object.assign(stored, patch);
          return { data: { change_id: stored.change_id } };
        },
        then(resolve) {
          if (matches()) stored = null;
          resolve({ error: null });
        },
      };
      return query;
    } },
  };
}

test('parallel handlers deliver once; a newer directory edit survives the earlier acknowledgement', async () => {
  const state = queueFixture();
  let sent = 0;
  const send = async () => { sent++; state.replace(); };
  await Promise.all([1, 2].map(() => deliverPending(state.db, 'dk', state.row, false, send)));
  assert.equal(sent, 1);
  assert.equal(state.read().change_id, '2');
  await deliverPending(state.db, 'dk', state.read(), false, async () => {});
  assert.equal(state.read(), null);
});

test('ambiguous delivery stays pending until a manual retry and the request window expires', async () => {
  const state = queueFixture();
  await assert.rejects(deliverPending(state.db, 'dk', state.row, false, async () => { throw Error('timeout'); }), /timeout/);
  assert.ok(state.read().attempted_at);
  const never = () => assert.fail('unexpected automatic retry');
  await assert.rejects(deliverPending(state.db, 'dk', state.read(), true, never), /직전 요청/);
  state.read().attempted_at = new Date(Date.now() - 30000).toISOString();
  await deliverPending(state.db, 'dk', state.read(), false, never);
  let manual = 0;
  await deliverPending(state.db, 'dk', { ...state.read() }, true, async () => { manual++; });
  assert.equal(manual, 1);
  assert.equal(state.read(), null);
});
