import { QUESTION_THREAD_TYPE } from './questions.js';
import { supabase } from './supabase.js';

/**
 * 질문 스레드는 물리 삭제하지 않는다. message에 대화 이력이 남아 있어
 * 소프트 삭제(is_deleted)로 목록에서만 숨긴다.
 */

export async function fetchKnowledgeByThreadIds(companyId, threadIds) {
  const ids = [...new Set(threadIds)].filter(Boolean);
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('knowledge')
    .select('id, question_text, answer_text, is_active, created_from_thread_id')
    .eq('company_id', companyId)
    .in('created_from_thread_id', ids)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function hideQuestionThreads(companyId, threadIds, { deactivateKnowledge = false } = {}) {
  const ids = [...new Set(threadIds)].filter(Boolean);
  if (!ids.length) throw new Error('스레드 id가 필요합니다.');

  const { data: threads, error: fetchError } = await supabase
    .from('thread')
    .select('id')
    .eq('company_id', companyId)
    .eq('type', QUESTION_THREAD_TYPE)
    .eq('is_deleted', false)
    .in('id', ids);
  if (fetchError) throw new Error(fetchError.message);

  const validIds = (threads || []).map((t) => t.id);
  if (!validIds.length) {
    throw new Error('숨길 수 있는 스레드가 없습니다.');
  }

  const now = new Date().toISOString();
  const { error: hideError } = await supabase
    .from('thread')
    .update({ is_deleted: true, deleted_at: now })
    .eq('company_id', companyId)
    .in('id', validIds);
  if (hideError) throw new Error(hideError.message);

  let knowledgeDeactivated = 0;
  if (deactivateKnowledge) {
    const { data: updated, error: knowledgeError } = await supabase
      .from('knowledge')
      .update({ is_active: false })
      .eq('company_id', companyId)
      .in('created_from_thread_id', validIds)
      .eq('is_active', true)
      .select('id');
    if (knowledgeError) throw new Error(knowledgeError.message);
    knowledgeDeactivated = updated?.length ?? 0;
  }

  return { hidden: validIds.length, knowledgeDeactivated };
}

export async function restoreQuestionThreads(companyId, threadIds) {
  const ids = [...new Set(threadIds)].filter(Boolean);
  if (!ids.length) throw new Error('스레드 id가 필요합니다.');

  const { data, error } = await supabase
    .from('thread')
    .update({ is_deleted: false, deleted_at: null })
    .eq('company_id', companyId)
    .eq('type', QUESTION_THREAD_TYPE)
    .eq('is_deleted', true)
    .in('id', ids)
    .select('id');
  if (error) throw new Error(error.message);

  return { restored: data?.length ?? 0 };
}
