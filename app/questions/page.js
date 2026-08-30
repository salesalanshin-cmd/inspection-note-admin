'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageHeader from '../../components/PageHeader';
import MobileListCard, { MobileCardField } from '../../components/MobileListCard';
import {
  QUESTION_STATUS_LABELS,
  buildQuestionListRows,
  fetchQuestionThreads,
  formatElapsed,
  isElapsedOver24h,
} from '../../lib/questions';
import { getCompanyId } from '../../lib/company';
import { supabase } from '../../lib/supabase';

const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 md:min-h-0';

const TABS = [
  { id: 'wait_manager', label: '답변 대기' },
  { id: 'all', label: '전체' },
  { id: 'done', label: '답변 완료' },
];

function StatusBadge({ status }) {
  const tone =
    status === 'wait_manager'
      ? 'bg-warnSoft text-warn'
      : status === 'acted' || status === 'resolved'
        ? 'bg-goodSoft text-good'
        : 'bg-surface2 text-muted';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {QUESTION_STATUS_LABELS[status] || status}
    </span>
  );
}

function ElapsedBadge({ createdAt }) {
  const over24 = isElapsedOver24h(createdAt);
  return (
    <span
      className={`text-sm font-semibold tabular-nums ${over24 ? 'text-danger' : 'text-text'}`}
    >
      {formatElapsed(createdAt)}
    </span>
  );
}

export default function QuestionsPage() {
  const [tab, setTab] = useState('wait_manager');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const companyId = await getCompanyId();
      const [directoryRes, threads] = await Promise.all([
        supabase.from('worker_directory').select('*').eq('company_id', companyId),
        fetchQuestionThreads(tab),
      ]);
      if (directoryRes.error) throw new Error(directoryRes.error.message);
      setRows(buildQuestionListRows(threads, directoryRes.data || []));
      setError(null);
    } catch (err) {
      setError(err.message || '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const emptyLabel = useMemo(() => {
    if (tab === 'wait_manager') return '답변 대기 중인 질문이 없습니다.';
    if (tab === 'done') return '답변 완료된 질문이 없습니다.';
    return '질문이 없습니다.';
  }, [tab]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        eyebrow="현장 Q&A"
        title="질문 답변"
        description="AI가 답하지 못한 작업자 질문에 답하고 지식으로 축적합니다."
        actions={
          <button type="button" onClick={load} className={btnSecondary}>
            새로고침
          </button>
        }
      />

      <div className="border-b border-border px-4 md:px-8">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        {error ? (
          <div className="rounded-xl border border-danger/30 bg-dangerSoft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted">불러오는 중...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">{emptyLabel}</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-2xl border border-border md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface2 text-left text-xs text-muted">
                    <th className="px-4 py-3 font-medium">경과</th>
                    <th className="px-4 py-3 font-medium">질문</th>
                    <th className="px-4 py-3 font-medium">작성자</th>
                    <th className="px-4 py-3 font-medium">공정</th>
                    <th className="px-4 py-3 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-border hover:bg-surface2/50">
                      <td className="px-4 py-3">
                        <ElapsedBadge createdAt={row.created_at} />
                      </td>
                      <td className="max-w-md px-4 py-3">
                        <Link
                          href={`/questions/${row.id}`}
                          className="font-medium text-text hover:text-accent"
                        >
                          {row.preview}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text">{row.displayName}</td>
                      <td className="px-4 py-3 text-muted">{row.process || '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <Link key={row.id} href={`/questions/${row.id}`}>
                  <MobileListCard
                    header={<span className="font-medium text-text">{row.preview}</span>}
                    badge={<StatusBadge status={row.status} />}
                  >
                  <MobileCardField label="경과">
                    <ElapsedBadge createdAt={row.created_at} />
                  </MobileCardField>
                  <MobileCardField label="작성자">{row.displayName}</MobileCardField>
                  <MobileCardField label="공정">{row.process || '—'}</MobileCardField>
                  </MobileListCard>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
