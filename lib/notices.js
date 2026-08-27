import { getDisplayName } from './analytics';
import { getCompanyId } from './company';
import { supabase } from './supabase';

/**
 * 공지는 notices 테이블이 아니라 thread(type='notice') + message + notice_read 조합이다.
 *
 * 다국어 정책 (현재):
 * - 관리 콘솔은 한국어로만 작성한다.
 * - 저장 시 message.body 와 message.body_ko 에 같은 값을 넣는다.
 * - 이후 번역이 붙으면 body_ko 는 한국어 원문으로 유지하고,
 *   body 를 사용자 언어(메시지 lang)로 채우는 구조가 된다.
 */

/** @deprecated getCompanyId() 사용 */
export async function fetchCompanyId() {
  return getCompanyId();
}

/** removed=false 인 공지 대상 인원 */
export function getNoticeAudience(workerDirectory) {
  return (workerDirectory || []).filter((row) => row?.worker_name && !row.removed);
}

export async function fetchNoticeThreads() {
  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from('thread')
    .select(
      'id, title, status, company_id, created_by_worker, created_at, resolved_at'
    )
    .eq('company_id', companyId)
    .eq('type', 'notice')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchNoticeReads(threadIds) {
  if (!threadIds?.length) return [];
  const { data, error } = await supabase
    .from('notice_read')
    .select('notice_thread_id, worker_name, read_at')
    .in('notice_thread_id', threadIds);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchNoticeMessage(threadId) {
  const { data, error } = await supabase
    .from('message')
    .select('id, thread_id, body, body_ko, lang, author_role, msg_type, created_at')
    .eq('thread_id', threadId)
    .eq('msg_type', 'system')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * 목록용 행 조립: 읽음 수는 audience(removed=false) 기준.
 */
export function buildNoticeListRows(threads, reads, audience) {
  const audienceNames = new Set(audience.map((w) => w.worker_name));
  const total = audienceNames.size;
  const readByThread = new Map();

  for (const row of reads || []) {
    if (!audienceNames.has(row.worker_name)) continue;
    const list = readByThread.get(row.notice_thread_id) || [];
    list.push(row);
    readByThread.set(row.notice_thread_id, list);
  }

  return (threads || []).map((thread) => {
    const readRows = readByThread.get(thread.id) || [];
    return {
      ...thread,
      readCount: readRows.length,
      audienceTotal: total,
      readWorkerNames: readRows.map((r) => r.worker_name),
    };
  });
}

export function splitReadUnread(audience, readWorkerNames, workerDirectory) {
  const readSet = new Set(readWorkerNames || []);
  const read = [];
  const unread = [];
  for (const row of audience) {
    const entry = {
      worker_name: row.worker_name,
      displayName: getDisplayName(row.worker_name, workerDirectory),
      phone_number: row.phone_number || '',
      read_at: null,
    };
    if (readSet.has(row.worker_name)) read.push(entry);
    else unread.push(entry);
  }
  read.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'));
  unread.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'));
  return { read, unread };
}

export async function createNotice({
  title,
  body,
  companyId,
  createdByWorker,
}) {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (!trimmedTitle) throw new Error('제목을 입력하세요.');
  if (!trimmedBody) throw new Error('본문을 입력하세요.');
  if (!companyId) throw new Error('회사 정보가 없습니다. MES 기준정보에서 회사를 등록하세요.');
  if (!createdByWorker) throw new Error('작성자를 선택하세요.');

  const { data: thread, error: threadError } = await supabase
    .from('thread')
    .insert({
      type: 'notice',
      title: trimmedTitle,
      status: 'open',
      company_id: companyId,
      created_by_worker: createdByWorker,
    })
    .select('*')
    .single();
  if (threadError) throw new Error(threadError.message);

  // 현재는 한국어 전용: body === body_ko. 다국어 도입 시 body_ko 유지, body만 번역본으로 교체.
  // message 테이블에 company_id 컬럼이 아직 없으면 thread_id 로만 격리.
  const { error: messageError } = await supabase.from('message').insert({
    thread_id: thread.id,
    author_role: 'manager',
    msg_type: 'system',
    body: trimmedBody,
    body_ko: trimmedBody,
    lang: 'ko',
  });
  if (messageError) {
    await supabase
      .from('thread')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', thread.id)
      .eq('company_id', companyId);
    throw new Error(messageError.message);
  }

  return thread;
}

export async function updateNotice({
  threadId,
  messageId,
  title,
  body,
  resetReads = false,
}) {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (!trimmedTitle) throw new Error('제목을 입력하세요.');
  if (!trimmedBody) throw new Error('본문을 입력하세요.');
  if (!threadId || !messageId) throw new Error('수정 대상 공지를 찾을 수 없습니다.');

  const companyId = await getCompanyId();

  const { error: threadError } = await supabase
    .from('thread')
    .update({ title: trimmedTitle })
    .eq('id', threadId)
    .eq('company_id', companyId);
  if (threadError) throw new Error(threadError.message);

  // 현재는 한국어 전용: body === body_ko. 다국어 도입 시 body_ko 유지, body만 번역본으로 교체.
  const { error: messageError } = await supabase
    .from('message')
    .update({
      body: trimmedBody,
      body_ko: trimmedBody,
      lang: 'ko',
    })
    .eq('id', messageId);
  if (messageError) throw new Error(messageError.message);

  if (resetReads) {
    const { error: readError } = await supabase
      .from('notice_read')
      .delete()
      .eq('notice_thread_id', threadId);
    if (readError) throw new Error(readError.message);
  }
}

/**
 * 공지 삭제 — is_deleted / deleted_at 소프트 삭제.
 * status 는 변경하지 않는다. 목록·조회는 is_deleted=false 만 본다.
 */
export async function deleteNotice(threadId) {
  if (!threadId) throw new Error('삭제 대상이 없습니다.');

  const companyId = await getCompanyId();
  const { data, error } = await supabase
    .from('thread')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', threadId)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('공지를 삭제할 수 없습니다.');
}
