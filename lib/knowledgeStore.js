import { supabase } from './supabase.js';
import { VOYAGE_MODEL } from './documents/constants.js';
import { embedTexts } from './documents/voyage.js';

function formatEmbeddingVector(values) {
  return `[${values.join(',')}]`;
}

/**
 * 관리자 답변을 knowledge에 저장하고 질문 텍스트를 임베딩한다.
 * 임베딩 실패 시에도 knowledge 행은 남긴다 (embedding null → 나중에 재시도 가능).
 */
export async function insertKnowledgeFromAnswer({
  companyId,
  questionText,
  answerText,
  sourceLabel,
  threadId,
}) {
  const question = String(questionText || '').trim();
  const answer = String(answerText || '').trim();
  if (!question || !answer) {
    throw new Error('지식 저장용 질문·답변이 비어 있습니다.');
  }

  let embedding = null;
  let embeddingError = null;
  try {
    const [vector] = await embedTexts([question]);
    embedding = formatEmbeddingVector(vector);
  } catch (err) {
    embeddingError = err?.message || '임베딩 실패';
    // eslint-disable-next-line no-console
    console.error('[knowledgeStore] embedding failed — knowledge row saved without vector', err);
  }

  const row = {
    company_id: companyId,
    question_text: question,
    answer_text: answer,
    source_label: sourceLabel,
    source_type: 'manager_answer',
    created_from_thread_id: threadId,
    embedding_model: VOYAGE_MODEL,
    is_active: true,
  };
  if (embedding) row.embedding = embedding;

  const { data, error } = await supabase.from('knowledge').insert(row).select('id').single();
  if (error) throw new Error(error.message);

  return {
    knowledgeId: data.id,
    embeddingSaved: Boolean(embedding),
    embeddingError,
  };
}
