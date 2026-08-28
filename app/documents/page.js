'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { History, RefreshCw, Upload } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import MobileListCard, { MobileCardField } from '../../components/MobileListCard';
import ModalShell from '../../components/ModalShell';
import { getCompanyId } from '../../lib/company';
import { supabase } from '../../lib/supabase';
import { isProcessingStatus, STATUS_LABELS } from '../../lib/documents/statusLabels';

const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0';
const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50 md:min-h-0';

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR');
}

function StatusBadge({ status }) {
  const tone =
    status === 'ready'
      ? 'bg-goodSoft text-good'
      : status === 'failed'
        ? 'bg-dangerSoft text-danger'
        : isProcessingStatus(status)
          ? 'bg-warnSoft text-warn'
          : 'bg-surface2 text-muted';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function KnowledgeDocumentsPage() {
  const [rows, setRows] = useState([]);
  const [chunkCounts, setChunkCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [historyDoc, setHistoryDoc] = useState(null);
  const [historyChain, setHistoryChain] = useState([]);
  const [reprocessId, setReprocessId] = useState(null);

  const fetchRows = useCallback(async () => {
    try {
      const companyId = await getCompanyId();
      const { data, error: fetchError } = await supabase
        .from('document')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (fetchError) throw new Error(fetchError.message);
      const docs = data || [];
      setRows(docs);

      if (docs.length) {
        const ids = docs.map((d) => d.id);
        const { data: chunks } = await supabase
          .from('document_chunk')
          .select('document_id')
          .eq('company_id', companyId)
          .in('document_id', ids);

        const counts = {};
        for (const c of chunks || []) {
          counts[c.document_id] = (counts[c.document_id] || 0) + 1;
        }
        setChunkCounts(counts);
      } else {
        setChunkCounts({});
      }
      setError(null);
    } catch (err) {
      setError(err.message || '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const hasProcessing = useMemo(
    () => rows.some((r) => isProcessingStatus(r.status)),
    [rows]
  );

  useEffect(() => {
    if (!hasProcessing) return undefined;
    const timer = setInterval(fetchRows, 3000);
    return () => clearInterval(timer);
  }, [hasProcessing, fetchRows]);

  async function toggleActive(doc) {
    const next = !doc.is_active;
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: next }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error || '상태 변경 실패');
      return;
    }
    fetchRows();
  }

  async function handleReprocess(documentId) {
    setReprocessId(documentId);
    try {
      const res = await fetch('/api/documents/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '재처리 실패');
      fetchRows();
    } catch (err) {
      alert(err.message);
    } finally {
      setReprocessId(null);
    }
  }

  async function openHistory(doc) {
    setHistoryDoc(doc);
    const companyId = await getCompanyId();
    const chain = [];
    let currentId = doc.id;
    const seen = new Set();

    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const { data } = await supabase
        .from('document')
        .select('id, title, version, supersedes, created_at, is_active, status')
        .eq('company_id', companyId)
        .eq('id', currentId)
        .maybeSingle();
      if (!data) break;
      chain.unshift(data);
      if (!data.supersedes) break;
      currentId = data.supersedes;
    }
    setHistoryChain(chain);
  }

  if (loading) return <div className="p-8 text-sm text-muted">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-sm text-danger">오류: {error}</div>;

  return (
    <div>
      <PageHeader
        eyebrow="KNOWLEDGE BASE"
        title="문서 지식베이스"
        description={`등록 문서 ${rows.length}건`}
        actions={
          <Link href="/documents/upload" className={btnPrimary}>
            <Upload className="h-4 w-4" />
            문서 업로드
          </Link>
        }
      />

      <div className="space-y-4 px-4 pb-8 pt-4 md:px-8">
        <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
          <table className="min-w-full text-sm">
            <thead className="bg-surface2 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">문서명</th>
                <th className="px-4 py-3 font-medium">버전</th>
                <th className="px-4 py-3 font-medium">페이지</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">조각</th>
                <th className="px-4 py-3 font-medium">업로드</th>
                <th className="px-4 py-3 font-medium">활성</th>
                <th className="px-4 py-3 font-medium">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {rows.map((doc) => (
                <tr key={doc.id} className={!doc.is_active ? 'opacity-60' : undefined}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-text">{doc.title || doc.file_name}</div>
                    <div className="text-xs text-muted">{doc.file_name}</div>
                  </td>
                  <td className="px-4 py-3">v{doc.version || 1}</td>
                  <td className="px-4 py-3">{doc.page_count || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={doc.status} />
                    {doc.status === 'failed' && doc.error_message ? (
                      <div className="mt-1 max-w-xs text-xs text-danger">{doc.error_message}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{chunkCounts[doc.id] ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(doc.created_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleActive(doc)}
                      className={`rounded-lg px-2 py-1 text-xs font-medium ${
                        doc.is_active
                          ? 'bg-goodSoft text-good'
                          : 'bg-surface2 text-muted'
                      }`}
                    >
                      {doc.is_active ? '활성' : '비활성'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/documents/${doc.id}/chunks`} className={btnSecondary}>
                        조각 보기
                      </Link>
                      <button type="button" onClick={() => openHistory(doc)} className={btnSecondary}>
                        <History className="h-4 w-4" />
                        개정 이력
                      </button>
                      {doc.status === 'failed' ? (
                        <button
                          type="button"
                          disabled={reprocessId === doc.id}
                          onClick={() => handleReprocess(doc.id)}
                          className={btnSecondary}
                        >
                          <RefreshCw className="h-4 w-4" />
                          재처리
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted">
                    등록된 문서가 없습니다. 업로드해 주세요.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {rows.map((doc) => (
            <MobileListCard key={doc.id} title={doc.title || doc.file_name} subtitle={doc.file_name}>
              <MobileCardField label="버전" value={`v${doc.version || 1}`} />
              <MobileCardField label="상태" value={<StatusBadge status={doc.status} />} />
              <MobileCardField label="조각" value={chunkCounts[doc.id] ?? '—'} />
              <MobileCardField label="업로드" value={formatDateTime(doc.created_at)} />
              {doc.status === 'failed' && doc.error_message ? (
                <p className="text-xs text-danger">{doc.error_message}</p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2">
                <Link href={`/documents/${doc.id}/chunks`} className={btnSecondary}>
                  조각 보기
                </Link>
                <button type="button" onClick={() => openHistory(doc)} className={btnSecondary}>
                  개정 이력
                </button>
              </div>
            </MobileListCard>
          ))}
        </div>
      </div>

      {historyDoc ? (
        <ModalShell
          title="개정 이력"
          onClose={() => {
            setHistoryDoc(null);
            setHistoryChain([]);
          }}
        >
          <ul className="divide-y divide-border rounded-xl border border-border mx-4 my-4 md:mx-6">
          {historyChain.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <div className="font-medium text-text">
                  {item.title} <span className="text-muted">v{item.version}</span>
                </div>
                <div className="text-xs text-muted">{formatDateTime(item.created_at)}</div>
              </div>
              <StatusBadge status={item.status} />
            </li>
          ))}
          {!historyChain.length ? (
            <li className="px-4 py-6 text-center text-sm text-muted">이력이 없습니다.</li>
          ) : null}
        </ul>
        </ModalShell>
      ) : null}
    </div>
  );
}
