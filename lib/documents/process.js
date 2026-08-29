import { supabase } from '../supabase.js';
import { chunkPages } from './chunking.js';
import {
  DOCUMENT_BUCKET,
  EMBED_BATCH_SIZE,
  EXTRACT_FAIL_RATE_THRESHOLD,
  EXTRACT_PAGE_BATCH,
  VOYAGE_MODEL,
} from './constants.js';
import {
  countUnembeddedChunks,
  deleteChunksForDocument,
  deleteWorkJson,
  downloadFile,
  ensureDocumentStoragePath,
  getDocument,
  insertChunks,
  insertPageIssues,
  readWorkJson,
  updateDocumentStatus,
  uploadWorkJson,
} from './db.js';
import { extractDocumentPages } from './extract.js';
import { embedTexts } from './voyage.js';

function formatEmbeddingVector(values) {
  return `[${values.join(',')}]`;
}

/**
 * pending / extracting 문서 1건 처리 (추출 단계)
 */
export async function processExtractStep(documentId, companyId) {
  try {
    return await processExtractStepInner(documentId, companyId);
  } catch (err) {
    await updateDocumentStatus(documentId, companyId, {
      status: 'failed',
      error_message: err?.message || '텍스트 추출 실패',
      processed_at: new Date().toISOString(),
    });
    throw err;
  }
}

async function processExtractStepInner(documentId, companyId) {
  const doc = await getDocument(documentId, companyId);
  if (!doc) return { skipped: true, reason: 'not_found' };
  if (!['pending', 'extracting'].includes(doc.status)) {
    return { skipped: true, reason: 'wrong_status', status: doc.status };
  }

  if (doc.status === 'pending') {
    await updateDocumentStatus(documentId, companyId, {
      status: 'extracting',
      error_message: null,
    });
  }

  let work = await readWorkJson(companyId, documentId, doc.version);
  if (!work) {
    work = {
      pages: [],
      nextPage: 1,
      totalPages: null,
      extractMethod: doc.file_type === 'pdf' ? 'pdfjs' : doc.file_type,
    };
  }

  const buffer = await downloadFile(doc.file_path);
  const fileType = doc.file_type;

  if (fileType === 'pdf') {
    const { pages, totalPages } = await extractDocumentPages(buffer, fileType, {
      startPage: work.nextPage,
      maxPages: EXTRACT_PAGE_BATCH,
    });

    work.totalPages = totalPages;
    work.pages.push(...pages);
    work.nextPage = (work.pages[work.pages.length - 1]?.pageNo ?? 0) + 1;

    const done = work.nextPage > totalPages;
    await uploadWorkJson(companyId, documentId, doc.version, work);

    if (!done) {
      return { documentId, status: 'extracting', progress: `${work.pages.length}/${totalPages}` };
    }
  } else {
    const { pages, totalPages } = await extractDocumentPages(buffer, fileType);
    work.pages = pages;
    work.totalPages = totalPages;
    work.nextPage = totalPages + 1;
    work.extractMethod = fileType;
    await uploadWorkJson(companyId, documentId, doc.version, work);
  }

  return finalizeExtraction(documentId, companyId, doc, work);
}

async function finalizeExtraction(documentId, companyId, doc, work) {
  const totalPages = work.totalPages || work.pages.length || 0;
  const issueRows = [];
  let skippedCount = 0;

  for (const page of work.pages) {
    if (page.issue) {
      issueRows.push({
        document_id: documentId,
        company_id: companyId,
        page_no: page.pageNo,
        issue: page.issue,
        resolved: false,
      });
    }
    if (page.skipped) skippedCount += 1;
  }

  if (issueRows.length) {
    await insertPageIssues(issueRows);
  }

  const failRate = totalPages > 0 ? skippedCount / totalPages : 0;
  if (failRate > EXTRACT_FAIL_RATE_THRESHOLD) {
    await updateDocumentStatus(documentId, companyId, {
      status: 'failed',
      page_count: totalPages,
      extract_method: work.extractMethod,
      error_message: `추출 실패 페이지가 ${Math.round(failRate * 100)}%로 기준(30%)을 초과했습니다. (${skippedCount}/${totalPages}페이지)`,
      processed_at: new Date().toISOString(),
    });
    return { documentId, status: 'failed', failRate };
  }

  await updateDocumentStatus(documentId, companyId, {
    status: 'chunking',
    page_count: totalPages,
    extract_method: work.extractMethod,
  });

  return processChunkStep(documentId, companyId, work);
}

/**
 * chunking 문서 처리
 */
export async function processChunkStep(documentId, companyId, workOverride = null) {
  const doc = await getDocument(documentId, companyId);
  if (!doc) return { skipped: true, reason: 'not_found' };

  if (doc.status === 'chunking' || workOverride) {
    const work = workOverride || (await readWorkJson(companyId, documentId, doc.version));
    if (!work?.pages?.length) {
      await updateDocumentStatus(documentId, companyId, {
        status: 'failed',
        error_message: '추출된 텍스트가 없습니다.',
        processed_at: new Date().toISOString(),
      });
      return { documentId, status: 'failed', reason: 'no_pages' };
    }

    const chunks = chunkPages(work.pages, work.extractMethod || doc.extract_method || 'text');
    await deleteChunksForDocument(documentId, companyId);

    if (!chunks.length) {
      await updateDocumentStatus(documentId, companyId, {
        status: 'failed',
        error_message: '조각을 생성할 수 있는 유효 페이지가 없습니다.',
        processed_at: new Date().toISOString(),
      });
      return { documentId, status: 'failed', reason: 'no_chunks' };
    }

    const rows = chunks.map((c) => ({
      document_id: documentId,
      company_id: companyId,
      chunk_index: c.chunk_index,
      content: c.content,
      content_tokens: c.content_tokens,
      page_from: c.page_from,
      page_to: c.page_to,
      section_label: c.section_label,
      extract_method: c.extract_method,
      embedding_model: null,
      is_verified: false,
    }));

    await insertChunks(rows);
    await deleteWorkJson(companyId, documentId, doc.version);

    await updateDocumentStatus(documentId, companyId, { status: 'embedding' });
    return processEmbedStep(documentId, companyId);
  }

  return { skipped: true, reason: 'wrong_status', status: doc.status };
}

/**
 * embedding 문서 배치 처리
 */
export async function processEmbedStep(documentId, companyId) {
  const doc = await getDocument(documentId, companyId);
  if (!doc || doc.status !== 'embedding') {
    return { skipped: true, reason: 'wrong_status', status: doc?.status };
  }

  const { data: pendingChunks, error } = await supabase
    .from('document_chunk')
    .select('id, content')
    .eq('document_id', documentId)
    .eq('company_id', companyId)
    .is('embedding', null)
    .order('chunk_index', { ascending: true })
    .limit(EMBED_BATCH_SIZE);

  if (error) throw new Error(error.message);

  if (!pendingChunks?.length) {
    const remaining = await countUnembeddedChunks(documentId, companyId);
    if (remaining === 0) {
      await updateDocumentStatus(documentId, companyId, {
        status: 'ready',
        processed_at: new Date().toISOString(),
        error_message: null,
      });
      return { documentId, status: 'ready' };
    }
    return { documentId, status: 'embedding', remaining };
  }

  const texts = pendingChunks.map((c) => c.content);
  let embeddings;
  try {
    embeddings = await embedTexts(texts);
  } catch (err) {
    await updateDocumentStatus(documentId, companyId, {
      status: 'failed',
      error_message: err?.message || '임베딩 실패',
    });
    throw err;
  }

  for (let i = 0; i < pendingChunks.length; i += 1) {
    const chunk = pendingChunks[i];
    const vector = embeddings[i];
    if (!vector) continue;
    const { error: updateError } = await supabase
      .from('document_chunk')
      .update({
        embedding: formatEmbeddingVector(vector),
        embedding_model: VOYAGE_MODEL,
      })
      .eq('id', chunk.id)
      .eq('company_id', companyId);
    if (updateError) throw new Error(updateError.message);
  }

  const remaining = await countUnembeddedChunks(documentId, companyId);
  if (remaining === 0) {
    await updateDocumentStatus(documentId, companyId, {
      status: 'ready',
      processed_at: new Date().toISOString(),
      error_message: null,
    });
    return { documentId, status: 'ready', embedded: pendingChunks.length };
  }

  return { documentId, status: 'embedding', embedded: pendingChunks.length, remaining };
}

/**
 * Cron — 처리할 문서 1건 선택 후 단계 진행
 */
export async function processNextDocument(companyId) {
  const statuses = ['pending', 'extracting', 'chunking', 'embedding'];
  for (const status of statuses) {
    const { data, error } = await supabase
      .from('document')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('status', status)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) continue;

    if (status === 'pending' || status === 'extracting') {
      return processExtractStep(data.id, companyId);
    }
    if (status === 'chunking') {
      return processChunkStep(data.id, companyId);
    }
    if (status === 'embedding') {
      return processEmbedStep(data.id, companyId);
    }
  }

  return { idle: true };
}

export async function reprocessDocument(documentId, companyId) {
  const doc = await ensureDocumentStoragePath(documentId, companyId);

  await deleteChunksForDocument(documentId, companyId);
  await deleteWorkJson(companyId, documentId, doc.version);

  await supabase
    .from('document_page_issue')
    .delete()
    .eq('document_id', documentId)
    .eq('company_id', companyId);

  await updateDocumentStatus(documentId, companyId, {
    status: 'pending',
    error_message: null,
    processed_at: null,
    page_count: 0,
    extract_method: null,
  });

  return { documentId, status: 'pending' };
}

export async function reembedChunk(chunkId, companyId, content, extra = {}) {
  const { data: chunk, error } = await supabase
    .from('document_chunk')
    .select('*')
    .eq('id', chunkId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!chunk) throw new Error('조각을 찾을 수 없습니다.');

  const [embedding] = await embedTexts([content]);
  const patch = {
    content,
    content_tokens: Math.max(1, Math.ceil(content.length / 3.5)),
    embedding: formatEmbeddingVector(embedding),
    embedding_model: VOYAGE_MODEL,
    ...extra,
  };
  const { data, error: updateError } = await supabase
    .from('document_chunk')
    .update(patch)
    .eq('id', chunkId)
    .eq('company_id', companyId)
    .select('*')
    .single();

  if (updateError) throw new Error(updateError.message);
  return data;
}
