'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Eye } from 'lucide-react';
import PageHeader from '../../../../components/PageHeader';
import ModalShell, { ModalFooterActions } from '../../../../components/ModalShell';
import { getCompanyId } from '../../../../lib/company';
import { supabase } from '../../../../lib/supabase';
import { ISSUE_LABELS, STATUS_LABELS } from '../../../../lib/documents/statusLabels';

const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0';
const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50 md:min-h-0';

function previewText(text, max = 180) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export default function DocumentChunksPage() {
  const params = useParams();
  const documentId = params.id;
  const [doc, setDoc] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editVerified, setEditVerified] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const companyId = await getCompanyId();
      const [docRes, chunkRes, issueRes] = await Promise.all([
        supabase
          .from('document')
          .select('*')
          .eq('id', documentId)
          .eq('company_id', companyId)
          .maybeSingle(),
        supabase
          .from('document_chunk')
          .select('*')
          .eq('document_id', documentId)
          .eq('company_id', companyId)
          .order('chunk_index', { ascending: true }),
        supabase
          .from('document_page_issue')
          .select('*')
          .eq('document_id', documentId)
          .eq('company_id', companyId)
          .order('page_no', { ascending: true }),
      ]);

      if (docRes.error) throw new Error(docRes.error.message);
      if (chunkRes.error) throw new Error(chunkRes.error.message);
      if (issueRes.error) throw new Error(issueRes.error.message);

      setDoc(docRes.data);
      setChunks(chunkRes.data || []);
      setIssues(issueRes.data || []);
      setError(null);
    } catch (err) {
      setError(err.message || '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function openEdit(chunk) {
    setEditing(chunk);
    setEditContent(chunk.content || '');
    setEditVerified(Boolean(chunk.is_verified));
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/chunks/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent, is_verified: editVerified }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '저장 실패');
      setEditing(null);
      fetchAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-sm text-muted">불러오는 중...</div>;
  if (error) return <div className="p-8 text-sm text-danger">오류: {error}</div>;
  if (!doc) return <div className="p-8 text-sm text-danger">문서를 찾을 수 없습니다.</div>;

  return (
    <div>
      <PageHeader
        eyebrow="KNOWLEDGE BASE"
        title={doc.title || doc.file_name}
        description={`v${doc.version || 1} · ${STATUS_LABELS[doc.status] || doc.status} · 조각 ${chunks.length}개`}
        actions={
          <Link href="/documents" className={btnSecondary}>
            목록으로
          </Link>
        }
      />

      <div className="space-y-8 px-4 pb-8 pt-4 md:px-8">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-text">조각 목록</h2>
          <div className="space-y-3">
            {chunks.map((chunk) => (
              <div
                key={chunk.id}
                className="rounded-xl border border-border bg-surface p-4 text-sm"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="font-medium text-text">#{chunk.chunk_index}</span>
                  {chunk.page_from != null ? (
                    <span>
                      p.{chunk.page_from}
                      {chunk.page_to != null && chunk.page_to !== chunk.page_from
                        ? `–${chunk.page_to}`
                        : ''}
                    </span>
                  ) : null}
                  {chunk.section_label ? (
                    <span className="rounded-full bg-accentSoft px-2 py-0.5 text-accent">
                      {chunk.section_label}
                    </span>
                  ) : null}
                  {chunk.is_verified ? (
                    <span className="rounded-full bg-goodSoft px-2 py-0.5 text-good">검증됨</span>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap text-text">{previewText(chunk.content, 400)}</p>
                <button type="button" onClick={() => openEdit(chunk)} className={`${btnSecondary} mt-3`}>
                  본문 수정
                </button>
              </div>
            ))}
            {!chunks.length ? (
              <p className="text-sm text-muted">조각이 없습니다. 처리가 완료될 때까지 기다려 주세요.</p>
            ) : null}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-text">페이지 이슈</h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-surface2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3">페이지</th>
                  <th className="px-4 py-3">이슈</th>
                  <th className="px-4 py-3">해결</th>
                  <th className="px-4 py-3">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {issues.map((issue) => (
                  <tr key={issue.id}>
                    <td className="px-4 py-3">{issue.page_no}</td>
                    <td className="px-4 py-3">{ISSUE_LABELS[issue.issue] || issue.issue}</td>
                    <td className="px-4 py-3">{issue.resolved ? '예' : '아니오'}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled
                        title="다음 단계에서 구현 예정"
                        className={`${btnSecondary} opacity-50`}
                      >
                        <Eye className="h-4 w-4" />
                        Vision 재처리
                      </button>
                    </td>
                  </tr>
                ))}
                {!issues.length ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted">
                      기록된 페이지 이슈가 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editing ? (
        <ModalShell
          title={`조각 #${editing.chunk_index ?? ''} 수정`}
          onClose={() => !saving && setEditing(null)}
          maxWidthClass="md:max-w-3xl"
          footer={
            <ModalFooterActions
              onCancel={() => setEditing(null)}
              onConfirm={saveEdit}
              confirmLabel={saving ? '저장 중...' : '저장 및 재임베딩'}
              confirmDisabled={saving || !editContent.trim()}
            />
          }
        >
          <div className="px-4 py-4 md:px-6">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={14}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <label className="mt-3 flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={editVerified}
                onChange={(e) => setEditVerified(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              검증 완료 (is_verified)
            </label>
            <p className="mt-2 text-xs text-muted">저장 시 해당 조각이 자동으로 재임베딩됩니다.</p>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
