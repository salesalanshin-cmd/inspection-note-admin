import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNoticeRequest, localizeNotices, noticeTranslationStore } from '../lib/noticeTranslation.js';
import { requestTranslations } from '../lib/noticeTranslationProvider.js';
import { WORKER_LANGS } from '../lib/constants.js';

const id = '00000000-0000-4000-8000-000000000001';
const foreign = '00000000-0000-4000-8000-000000000002';
const valid = { locale: 'vi', noticeIds: [id], includeBodies: true };
const original = () => [{ id, title: '안전 공지', messages: [{ id: 'm', sourceBody: 'DC-01 점검' }] }];

function fakeStore() {
  const state = { notices: original(), cache: new Map(), reads: 0 };
  const key = (p) => [p.threadId, p.partId, p.kind, p.hash].join('/');
  return {
    state,
    async readNotices(ids, includeBodies) {
      state.reads++;
      return state.notices.filter((r) => ids.includes(r.id))
        .map((r) => ({ ...r, messages: includeBodies ? [...r.messages] : [] }));
    },
    async readCache(parts, locale) {
      return new Map(parts.flatMap((p) => {
        const hit = state.cache.get(locale + key(p));
        return hit ? [[key(p), hit]] : [];
      }));
    },
    async writeCache(parts, locale) {
      for (const p of parts) state.cache.set(locale + key(p), p.translation);
    },
  };
}

test('only bounded notice ID lists and known locales are accepted, no user-supplied text', () => {
  for (const { value: locale } of WORKER_LANGS.filter(({ value }) => value !== 'ko')) {
    assert.deepEqual(parseNoticeRequest({ locale, noticeIds: [id] }), { locale, noticeIds: [id], includeBodies: false });
  }
  assert.deepEqual(parseNoticeRequest({ locale: 'en', noticeIds: [id, id] }), { locale: 'en', noticeIds: [id], includeBodies: false });
  for (const v of [null, { ...valid, text: 'free text' }, { ...valid, noticeIds: [42] }, { ...valid, locale: 'toString' },
    { ...valid, noticeIds: new Array(21).fill(id) }, { ...valid, includeBodies: 1 }]) assert.equal(parseNoticeRequest(v), null);
});

test('existing notices are translated on first read, edits refresh only the changed part', async () => {
  const store = fakeStore();
  const seen = [];
  const translate = async (sources, locale) => { seen.push(sources); return sources.map((v) => locale + ':' + v); };
  const list = await localizeNotices(store, { ...valid, includeBodies: false }, translate);
  assert.deepEqual(seen, [['안전 공지']]);
  assert.deepEqual(list.notices[0].messages, []);
  const page = await localizeNotices(store, valid, translate);
  assert.equal(page.notices[0].messages[0].body, 'vi:DC-01 점검');
  assert.equal(page.notices[0].messages[0].sourceBody, 'DC-01 점검');
  await localizeNotices(store, valid, translate);
  assert.equal(seen.length, 2);
  store.state.notices[0].title = '변경 공지';
  const edited = await localizeNotices(store, valid, translate);
  assert.equal(edited.notices[0].title, 'vi:변경 공지');
  assert.deepEqual(seen.at(-1), ['변경 공지']);
  await localizeNotices(store, { ...valid, locale: 'km' }, translate);
  assert.deepEqual(seen.at(-1), ['변경 공지', 'DC-01 점검']);
});

test('deleted notices or changed bodies cannot return stale content after a translation call', async () => {
  let store = fakeStore();
  const edited = await localizeNotices(store, valid, async (src) => {
    store.state.notices[0].messages[0].sourceBody = '새 내용';
    return src.map(() => 'old translation');
  });
  assert.equal(edited.notices[0].messages[0].body, '새 내용');
  assert.deepEqual(edited.unavailableIds, [id]);
  store = fakeStore();
  const removed = await localizeNotices(store, { ...valid, noticeIds: [id, foreign] }, async (src) => {
    store.state.notices = []; return src.map(() => 'old translation');
  });
  assert.deepEqual(removed.notices, []);
  assert.deepEqual(removed.unavailableIds, [id, foreign]);
});

test('failed translations keep the source and are retried on the next read', async () => {
  const store = fakeStore();
  const failed = await localizeNotices(store, valid, async () => []);
  assert.deepEqual(failed.unavailableIds, [id]);
  assert.equal(failed.notices[0].title, '안전 공지');
  assert.equal(store.state.cache.size, 0);
  const ok = await localizeNotices(store, valid, async (src) => src.map(() => 'translated'));
  assert.deepEqual(ok.unavailableIds, []);
});

test('service role queries include the requesting company, notice type and deletion filters', async () => {
  const calls = [];
  const rows = [{ id, title: 'notice', message: [
    { id: 'a', thread_id: id, company_id: null, author_role: 'manager', msg_type: 'system', body: 'old notice' },
    { id: 'b', thread_id: id, company_id: foreign, author_role: 'manager', msg_type: 'system', body: 'wrong tenant' },
    { id: 'c', thread_id: id, author_role: 'worker', msg_type: 'answer', body: 'personal reply' },
  ] }];
  const db = { from(table) {
    assert.equal(table, 'thread');
    return { select() { return this; }, eq(...args) { calls.push(args); return this; },
      in(...args) { calls.push(args); return this; }, then(yes) { yes({ data: rows }); } };
  } };
  const notices = await noticeTranslationStore(db, 'our-company').readNotices([id], true);
  assert.deepEqual(calls.slice(0,4), [['company_id','our-company'],['type','notice'],['is_deleted',false],['id',[id]]]);
  assert.deepEqual(notices[0].messages, [{ id: 'a', sourceBody: 'old notice' }]);
});

test('model output must preserve protected numbers, lot codes and URLs', async () => {
  const source = 'LOT DC-01 30개 https://example.invalid/1';
  const client = (transform) => ({ messages: { create: async (req) => {
    const masked = JSON.parse(req.messages[0].content);
    assert.ok(!masked[0].includes('DC-01') && !masked[0].includes('example.invalid'));
    return { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'translated_strings', input: { strings: masked.map(transform) } }] };
  } } });
  assert.deepEqual(await requestTranslations(client((s) => 'Result '+s), [source], 'English'), ['Result '+source]);
  assert.deepEqual(await requestTranslations(client(() => 'Missing values'), [source], 'English'), [null]);
});
