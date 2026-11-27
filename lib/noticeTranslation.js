import { createHash } from 'node:crypto';

export const noticeLocales = {
  en: 'English', vi: 'Vietnamese', th: 'Thai', km: 'Khmer',
  uz: 'Uzbek (Latin script)', ne: 'Nepali (Devanagari script)', kk: 'Kazakh (Cyrillic script)', id: 'Indonesian',
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function parseNoticeRequest(value) {
  if (!value || !Object.hasOwn(noticeLocales, value.locale) || !Array.isArray(value.noticeIds) ||
      value.noticeIds.length < 1 || value.noticeIds.length > 20 ||
      !value.noticeIds.every((id) => typeof id === 'string' && uuid.test(id)) ||
      (value.includeBodies !== undefined && typeof value.includeBodies !== 'boolean') ||
      Object.keys(value).some((k) => !['locale', 'noticeIds', 'includeBodies'].includes(k))) return null;
  return { locale: value.locale, noticeIds: [...new Set(value.noticeIds.map((s) => s.toLowerCase()))], includeBodies: value.includeBodies === true };
}

function fields(notices) {
  const parts = [];
  function add(threadId, partId, kind, text) {
    if (typeof text !== 'string' || !text.trim()) return;
    const hash = createHash('sha256').update(text).digest('hex');
    parts.push({ threadId, partId, kind, text, hash });
  }
  for (const notice of notices) {
    add(notice.id, notice.id, 'title', notice.title);
    for (const msg of notice.messages) add(notice.id, msg.id, 'body', msg.sourceBody);
  }
  return parts;
}

const partKey = (p) => [p.threadId, p.partId, p.kind, p.hash].join('/');

export function noticeTranslationStore(db, companyId) {
  return {
    async readNotices(ids, includeBodies) {
      const columns = includeBodies ? 'id,title,message(id,thread_id,company_id,author_role,msg_type,body_ko,body,created_at)' : 'id,title';
      let query = db.from('thread').select(columns)
        .eq('company_id', companyId).eq('type', 'notice').eq('is_deleted', false).in('id', ids);
      if (includeBodies) query = query.in('message.author_role', ['manager', 'system']);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((thread) => ({
        id: thread.id, title: thread.title || '',
        messages: (thread.message || []).filter((m) =>
          m.thread_id === thread.id && (!m.company_id || m.company_id === companyId) &&
          (m.author_role === 'manager' || (m.author_role === 'system' && m.msg_type === 'system'))
        ).map((m) => ({ id: m.id, sourceBody: m.body_ko || m.body || '' })),
      }));
    },
    async readCache(parts, locale) {
      const found = new Map();
      for (let i = 0; i < parts.length; i += 50) {
        const page = parts.slice(i, i + 50);
        const { data, error } = await db.from('notice_translation')
          .select('thread_id,part_id,part_kind,source_hash,translated_text')
          .eq('company_id', companyId).eq('locale', locale)
          .in('thread_id', [...new Set(page.map((p) => p.threadId))])
          .in('source_hash', [...new Set(page.map((p) => p.hash))]);
        if (error) throw error;
        for (const row of data || []) {
          found.set([row.thread_id, row.part_id, row.part_kind, row.source_hash].join('/'), row.translated_text);
        }
      }
      return found;
    },
    async writeCache(parts, locale) {
      if (!parts.length) return;
      const { error } = await db.from('notice_translation').upsert(parts.map((p) => ({
        company_id: companyId, thread_id: p.threadId, part_id: p.partId, part_kind: p.kind,
        source_hash: p.hash, locale, translated_text: p.translation,
      })), { onConflict: 'company_id,thread_id,locale,part_kind,part_id,source_hash', ignoreDuplicates: true });
      if (error) throw error;
    },
  };
}

// Only server-loaded, currently visible official notices can enter the provider.
// A final read after translation also handles edits/deletion during the request.
export async function localizeNotices(store, request, translate) {
  const { locale, noticeIds, includeBodies } = request;
  let notices = await store.readNotices(noticeIds, includeBodies);
  let parts = fields(notices);
  const cache = await store.readCache(parts, locale);
  const missing = parts.filter((p) => !cache.has(partKey(p)));
  if (missing.length) {
    const input = [...new Set(missing.map((p) => p.text))];
    const translations = await translate(input, locale);
    const bySource = new Map(input.map((s, i) => [s, translations[i]]));
    const ready = missing.map((p) => ({ ...p, translation: bySource.get(p.text) }))
      .filter((p) => typeof p.translation === 'string' && p.translation.trim());
    await store.writeCache(ready, locale);
    for (const p of ready) cache.set(partKey(p), p.translation);
    notices = await store.readNotices(noticeIds, includeBodies);
    parts = fields(notices);
  }
  const result = new Map(notices.map((n) => [n.id, {
    id: n.id, sourceTitle: n.title, title: n.title, messages: [],
  }]));
  const unavailable = new Set(noticeIds.filter((id) => !result.has(id)));
  for (const p of parts) {
    const translated = cache.get(partKey(p));
    if (!translated) unavailable.add(p.threadId);
    const row = result.get(p.threadId);
    if (p.kind === 'title') row.title = translated || p.text;
    else row.messages.push({ id: p.partId, sourceBody: p.text, body: translated || p.text });
  }
  return { locale, notices: [...result.values()], unavailableIds: [...unavailable] };
}
