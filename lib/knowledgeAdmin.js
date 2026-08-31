import { supabase } from './supabase.js';
import { EMBED_BATCH_SIZE, VOYAGE_MODEL } from './documents/constants.js';
import { embedTexts } from './documents/voyage.js';
import { SOURCE_TYPES } from './knowledgeDisplay.js';

export { SOURCE_TYPES, SOURCE_TYPE_LABELS } from './knowledgeDisplay.js';

function formatEmbeddingVector(values) {
  return `[${values.join(',')}]`;
}

/**
 * knowledge 행은 삭제하지 않는다. 과거 AI 답변의 근거(source)가 해당 지식일 수 있어
 * "왜 그때 그렇게 답했는지" 추적이 필요하다. is_active=false / superseded_by 로 검색에서 제외한다.
 */

async function embedQuestion(questionText) {
  const question = String(questionText || '').trim();
  if (!question) throw new Error('질문 텍스트가 비어 있습니다.');
  const [vector] = await embedTexts([question]);
  return formatEmbeddingVector(vector);
}

async function getKnowledgeRow(id, companyId) {
  const { data, error } = await supabase
    .from('knowledge')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('지식을 찾을 수 없습니다.');
  return data;
}

/**
 * @param {string} companyId
 * @param {{ sourceType?: string, activeFilter?: 'all'|'active'|'inactive', search?: string, sort?: 'latest'|'helpful' }} opts
 */
export async function listKnowledge(companyId, opts = {}) {
  const { sourceType, activeFilter = 'all', search, sort = 'latest' } = opts;

  let query = supabase.from('knowledge').select('*').eq('company_id', companyId);

  if (sourceType && SOURCE_TYPES.includes(sourceType)) {
    query = query.eq('source_type', sourceType);
  }
  if (activeFilter === 'active') query = query.eq('is_active', true);
  if (activeFilter === 'inactive') query = query.eq('is_active', false);

  const q = String(search || '').trim().replace(/[%_,]/g, ' ');
  if (q) {
    query = query.or(`question_text.ilike.%${q}%,answer_text.ilike.%${q}%`);
  }

  if (sort === 'helpful') {
    query = query.order('helpful_count', { ascending: false, nullsFirst: false });
  } else {
    query = query.order('created_at', { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query.limit(500);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createKnowledge(companyId, fields) {
  const question = String(fields.questionText || '').trim();
  const answer = String(fields.answerText || '').trim();
  const sourceLabel = String(fields.sourceLabel || '').trim();
  const sourceType = fields.sourceType || 'doc';

  if (!question || !answer) {
    throw new Error('질문과 답변을 입력하세요.');
  }
  if (!sourceLabel) {
    throw new Error('출처 라벨을 입력하세요.');
  }
  if (!SOURCE_TYPES.includes(sourceType)) {
    throw new Error('유효하지 않은 source_type입니다.');
  }

  let embedding = null;
  let embeddingError = null;
  try {
    embedding = await embedQuestion(question);
  } catch (err) {
    embeddingError = err?.message || '임베딩 실패';
    // eslint-disable-next-line no-console
    console.error('[knowledgeAdmin] create embedding failed', err);
  }

  const row = {
    company_id: companyId,
    question_text: question,
    answer_text: answer,
    source_label: sourceLabel,
    source_type: sourceType,
    embedding_model: VOYAGE_MODEL,
    is_active: true,
  };
  if (fields.validUntil) row.valid_until = fields.validUntil;
  if (embedding) row.embedding = embedding;

  const { data, error } = await supabase.from('knowledge').insert(row).select('*').single();
  if (error) throw new Error(error.message);

  return { knowledge: data, embeddingSaved: Boolean(embedding), embeddingError };
}

/**
 * @param {'overwrite'|'supersede'} mode
 * - overwrite: 같은 행 수정 + 재임베딩 (오타·소폭 수정)
 * - supersede: 새 행 생성, 기존 행 is_active=false + superseded_by (내용 변경 이력 보존)
 */
export async function updateKnowledge(companyId, id, fields, mode = 'overwrite') {
  const existing = await getKnowledgeRow(id, companyId);

  const question = fields.questionText != null ? String(fields.questionText).trim() : existing.question_text;
  const answer = fields.answerText != null ? String(fields.answerText).trim() : existing.answer_text;

  if (!question || !answer) {
    throw new Error('질문과 답변을 입력하세요.');
  }

  const questionChanged = question !== existing.question_text;
  const answerChanged = answer !== existing.answer_text;
  if (!questionChanged && !answerChanged && fields.isActive === undefined) {
    return { knowledge: existing, embeddingSaved: true, mode };
  }

  if (mode === 'supersede' && (questionChanged || answerChanged)) {
    const sourceLabel =
      fields.sourceLabel != null ? String(fields.sourceLabel).trim() : existing.source_label;
    if (!sourceLabel) throw new Error('출처 라벨을 입력하세요.');

    const embedding = await embedQuestion(question);

    const newRow = {
      company_id: companyId,
      question_text: question,
      answer_text: answer,
      source_label: sourceLabel,
      source_type: existing.source_type,
      created_from_thread_id: existing.created_from_thread_id,
      embedding_model: VOYAGE_MODEL,
      embedding,
      is_active: true,
    };
    if (fields.validUntil !== undefined) {
      newRow.valid_until = fields.validUntil || null;
    } else if (existing.valid_until) {
      newRow.valid_until = existing.valid_until;
    }

    const { data: created, error: insertError } = await supabase
      .from('knowledge')
      .insert(newRow)
      .select('*')
      .single();
    if (insertError) throw new Error(insertError.message);

    const { error: updateError } = await supabase
      .from('knowledge')
      .update({ is_active: false, superseded_by: created.id })
      .eq('id', id)
      .eq('company_id', companyId);
    if (updateError) throw new Error(updateError.message);

    return { knowledge: created, embeddingSaved: true, mode: 'supersede', supersededId: id };
  }

  const patch = {};
  if (questionChanged) patch.question_text = question;
  if (answerChanged) patch.answer_text = answer;
  if (fields.sourceLabel != null) {
    const label = String(fields.sourceLabel).trim();
    if (!label) throw new Error('출처 라벨을 입력하세요.');
    patch.source_label = label;
  }
  if (typeof fields.isActive === 'boolean') patch.is_active = fields.isActive;
  if (fields.validUntil !== undefined) patch.valid_until = fields.validUntil || null;

  if (questionChanged || answerChanged) {
    patch.embedding = await embedQuestion(question);
    patch.embedding_model = VOYAGE_MODEL;
  }

  if (!Object.keys(patch).length) {
    return { knowledge: existing, embeddingSaved: true, mode: 'overwrite' };
  }

  const { data, error } = await supabase
    .from('knowledge')
    .update(patch)
    .eq('id', id)
    .eq('company_id', companyId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  return { knowledge: data, embeddingSaved: true, mode: 'overwrite' };
}

export async function toggleKnowledgeActive(companyId, id, isActive) {
  const { data, error } = await supabase
    .from('knowledge')
    .update({ is_active: isActive })
    .eq('id', id)
    .eq('company_id', companyId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * CSV 일괄 등록 — 유효 행만 임베딩(배치) 후 insert
 * @param {Array<{ question_text: string, answer_text: string, source_label: string, valid_until?: string|null }>} rows
 */
export async function bulkCreateKnowledge(companyId, rows) {
  const valid = [];
  let skipped = 0;

  for (const row of rows) {
    const question = String(row.question_text || '').trim();
    const answer = String(row.answer_text || '').trim();
    const sourceLabel = String(row.source_label || '').trim();
    if (!question || !answer || !sourceLabel) {
      skipped += 1;
      continue;
    }
    valid.push({
      question_text: question,
      answer_text: answer,
      source_label: sourceLabel,
      valid_until: row.valid_until?.trim() || null,
    });
  }

  if (!valid.length) {
    return { created: 0, skipped, embeddingErrors: 0, items: [] };
  }

  const embeddings = [];
  let embeddingErrors = 0;

  for (let i = 0; i < valid.length; i += EMBED_BATCH_SIZE) {
    const batch = valid.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((r) => r.question_text);
    try {
      const vectors = await embedTexts(texts);
      for (let j = 0; j < batch.length; j += 1) {
        embeddings.push(formatEmbeddingVector(vectors[j]));
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[knowledgeAdmin] bulk embed batch failed', err);
      for (let j = 0; j < batch.length; j += 1) {
        embeddings.push(null);
        embeddingErrors += 1;
      }
    }
  }

  const insertRows = valid.map((row, index) => {
    const item = {
      company_id: companyId,
      question_text: row.question_text,
      answer_text: row.answer_text,
      source_label: row.source_label,
      source_type: 'doc',
      embedding_model: VOYAGE_MODEL,
      is_active: true,
    };
    if (row.valid_until) item.valid_until = row.valid_until;
    if (embeddings[index]) item.embedding = embeddings[index];
    return item;
  });

  const { data, error } = await supabase.from('knowledge').insert(insertRows).select('id');
  if (error) throw new Error(error.message);

  return {
    created: data?.length ?? insertRows.length,
    skipped,
    embeddingErrors,
    items: data || [],
  };
}
