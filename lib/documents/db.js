import { getCompanyId } from '../company.js';
import { supabase } from '../supabase.js';
import {
  DOCUMENT_BUCKET,
  storageObjectPath,
  workExtractPath,
} from './constants.js';

export async function scopedCompanyId() {
  return getCompanyId();
}

export async function getDocument(documentId, companyId) {
  const cid = companyId || (await scopedCompanyId());
  const { data, error } = await supabase
    .from('document')
    .select('*')
    .eq('id', documentId)
    .eq('company_id', cid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listDocuments(companyId) {
  const cid = companyId || (await scopedCompanyId());
  const { data, error } = await supabase
    .from('document')
    .select('*')
    .eq('company_id', cid)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function findActiveByFileName(fileName, companyId) {
  const cid = companyId || (await scopedCompanyId());
  const { data, error } = await supabase
    .from('document')
    .select('*')
    .eq('company_id', cid)
    .eq('file_name', fileName)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createDocumentRow({
  companyId,
  title,
  fileName,
  fileType,
  version = 1,
  supersedes = null,
  uploadedBy = null,
}) {
  const cid = companyId || (await scopedCompanyId());
  const { data: inserted, error: insertError } = await supabase
    .from('document')
    .insert({
      company_id: cid,
      title: title || fileName,
      file_name: fileName,
      file_path: 'pending',
      file_type: fileType,
      page_count: 0,
      version,
      supersedes,
      is_active: true,
      status: 'pending',
      uploaded_by: uploadedBy,
    })
    .select('*')
    .single();
  if (insertError) throw new Error(insertError.message);

  const filePath = storageObjectPath(cid, inserted.id, version, fileName);
  const { data, error } = await supabase
    .from('document')
    .update({ file_path: filePath })
    .eq('id', inserted.id)
    .eq('company_id', cid)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deactivateDocument(documentId, companyId) {
  const cid = companyId || (await scopedCompanyId());
  const { error } = await supabase
    .from('document')
    .update({ is_active: false })
    .eq('id', documentId)
    .eq('company_id', cid);
  if (error) throw new Error(error.message);
}

export async function updateDocumentStatus(documentId, companyId, patch) {
  const cid = companyId || (await scopedCompanyId());
  const { data, error } = await supabase
    .from('document')
    .update(patch)
    .eq('id', documentId)
    .eq('company_id', cid)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function countChunks(documentId, companyId) {
  const cid = companyId || (await scopedCompanyId());
  const { count, error } = await supabase
    .from('document_chunk')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', documentId)
    .eq('company_id', cid);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function countUnembeddedChunks(documentId, companyId) {
  const cid = companyId || (await scopedCompanyId());
  const { count, error } = await supabase
    .from('document_chunk')
    .select('*', { count: 'exact', head: true })
    .eq('document_id', documentId)
    .eq('company_id', cid)
    .is('embedding', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function listChunks(documentId, companyId) {
  const cid = companyId || (await scopedCompanyId());
  const { data, error } = await supabase
    .from('document_chunk')
    .select('*')
    .eq('document_id', documentId)
    .eq('company_id', cid)
    .order('chunk_index', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listPageIssues(documentId, companyId) {
  const cid = companyId || (await scopedCompanyId());
  const { data, error } = await supabase
    .from('document_page_issue')
    .select('*')
    .eq('document_id', documentId)
    .eq('company_id', cid)
    .order('page_no', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function insertPageIssues(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('document_page_issue').insert(rows);
  if (error) throw new Error(error.message);
}

export async function deleteChunksForDocument(documentId, companyId) {
  const cid = companyId || (await scopedCompanyId());
  const { error } = await supabase
    .from('document_chunk')
    .delete()
    .eq('document_id', documentId)
    .eq('company_id', cid);
  if (error) throw new Error(error.message);
}

export async function insertChunks(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('document_chunk').insert(rows);
  if (error) throw new Error(error.message);
}

export async function downloadFile(filePath) {
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).download(filePath);
  if (error) throw new Error(error.message);
  return Buffer.from(await data.arrayBuffer());
}

export async function uploadWorkJson(companyId, documentId, version, payload) {
  const path = workExtractPath(companyId, documentId, version);
  const body = JSON.stringify(payload);
  const { error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(path, body, { upsert: true, contentType: 'application/json' });
  if (error) throw new Error(error.message);
  return path;
}

export async function readWorkJson(companyId, documentId, version) {
  const path = workExtractPath(companyId, documentId, version);
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).download(path);
  if (error) return null;
  const text = await data.text();
  return JSON.parse(text);
}

export async function deleteWorkJson(companyId, documentId, version) {
  const path = workExtractPath(companyId, documentId, version);
  await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
}

export async function getSupersessionChain(documentId, companyId) {
  const cid = companyId || (await scopedCompanyId());
  const chain = [];
  let currentId = documentId;
  const seen = new Set();

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const { data, error } = await supabase
      .from('document')
      .select('id, title, version, supersedes, created_at, is_active, status')
      .eq('id', currentId)
      .eq('company_id', cid)
      .maybeSingle();
    if (error || !data) break;
    chain.unshift(data);
    if (!data.supersedes) break;
    currentId = data.supersedes;
  }

  return chain;
}
