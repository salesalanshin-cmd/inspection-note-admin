'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageHeader from '../../components/PageHeader';
import ModalShell, { ModalFooterActions } from '../../components/ModalShell';
import MobileListCard, { MobileCardField } from '../../components/MobileListCard';
import {
  QUESTION_STATUS_LABELS,
  buildQuestionListRows,
  fetchManagerMessagesForThreads,
  fetchQuestionThreads,
  formatElapsed,
  isElapsedOver24h,
} from '../../lib/questions';
import { previewText } from '../../lib/knowledgeDisplay';
import { getCompanyId } from '../../lib/company';
import { supabase } from '../../lib/supabase';

const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50 md:min-h-0';
const btnDanger =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-danger/30 bg-dangerSoft px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-50 md:min-h-0';

const TABS = [
  { id: 'wait_manager', label: '답변 대기' },
  { id: 'all', label: '전체' },
  { id: 'done', label: '답변 완료' },
];

function ReinquiryBadge() {
  return (
    <span className="inline-flex rounded-full bg-warnSoft px-2 py-0.5 text-[10px] font-medium text-warn">
      재문의
    </span>
  );
}

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

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR');
}

export default function QuestionsPage() {
  const [tab, setTab] = useState('wait_manager');
  const [showHidden, setShowHidden] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [hideDialog, setHideDialog] = useState(null);
  const [linkedKnowledge, setLinkedKnowledge] = useState([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [deactivateKnowledge, setDeactivateKnowledge] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [restoringId, setRestoringId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const companyId = await getCompanyId();
      const [directoryRes, threads] = await Promise.all([
        supabase.from('worker_directory').select('*').eq('company_id', companyId),
        fetchQuestionThreads(tab, { includeHidden: showHidden }),
      ]);
      if (directoryRes.error) throw new Error(directoryRes.error.message);
      const managerByThread = showHidden
        ? null
        : await fetchManagerMessagesForThreads(threads.map((t) => t.id));
      setRows(
        buildQuestionListRows(threads, directoryRes.data || [], {
          managerMessagesByThread: managerByThread,
        })
      );
      setSelectedIds(new Set());
      setError(null);
    } catch (err) {
      setError(err.message || '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [tab, showHidden]);

  useEffect(() => {
    load();
  }, [load]);

  const emptyLabel = useMemo(() => {
    if (showHidden) return '숨긴 질문이 없습니다.';
    if (tab === 'wait_manager') return '답변 대기 중인 질문이 없습니다.';
    if (tab === 'done') return '답변 완료된 질문이 없습니다.';
    return '질문이 없습니다.';
  }, [tab, showHidden]);

  const allSelected = rows.length > 0 && selectedIds.size === rows.length;
  const someSelected = selectedIds.size > 0;

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(rows.map((r) => r.id)));
  }

  async function openHideDialog(threadIds) {
    const ids = [...new Set(threadIds)].filter(Boolean);
    if (!ids.length) return;
    setHideDialog({ threadIds: ids });
    setDeactivateKnowledge(false);
    setLinkedKnowledge([]);
    setLoadingKnowledge(true);
    try {
      const res = await fetch(`/api/questions/linked-knowledge?threadIds=${ids.join(',')}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '지식 조회 실패');
      setLinkedKnowledge(json.items || []);
      const activeCount = (json.items || []).filter((k) => k.is_active).length;
      setDeactivateKnowledge(activeCount > 0);
    } catch (err) {
      alert(err.message);
      setHideDialog(null);
    } finally {
      setLoadingKnowledge(false);
    }
  }

  async function confirmHide() {
    if (!hideDialog || hiding) return;
    setHiding(true);
    try {
      const res = await fetch('/api/questions/hide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadIds: hideDialog.threadIds,
          deactivateKnowledge,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '숨기기 실패');
      setHideDialog(null);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setHiding(false);
    }
  }

  async function restoreThread(threadId) {
    if (restoringId) return;
    setRestoringId(threadId);
    try {
      const res = await fetch('/api/questions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadIds: [threadId] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '복원 실패');
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setRestoringId(null);
    }
  }

  const activeLinkedCount = linkedKnowledge.filter((k) => k.is_active).length;

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            {!showHidden
              ? TABS.map((t) => (
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
                ))
              : (
                  <span className="border-b-2 border-accent px-3 py-2.5 text-sm font-medium text-accent">
                    숨긴 항목
                  </span>
                )}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowHidden((v) => !v);
              setSelectedIds(new Set());
            }}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              showHidden
                ? 'bg-accentSoft text-accent'
                : 'bg-surface2 text-muted hover:text-text'
            }`}
          >
            {showHidden ? '일반 목록으로' : '숨긴 항목 보기'}
          </button>
        </div>
      </div>

      {!showHidden && someSelected ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface2/50 px-4 py-2 md:px-8">
          <span className="text-sm text-muted">{selectedIds.size}건 선택</span>
          <button
            type="button"
            className={btnDanger}
            onClick={() => openHideDialog([...selectedIds])}
          >
            선택 항목 숨기기
          </button>
          <button type="button" className={btnSecondary} onClick={() => setSelectedIds(new Set())}>
            선택 해제
          </button>
        </div>
      ) : null}

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
                    {!showHidden ? (
                      <th className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          aria-label="전체 선택"
                        />
                      </th>
                    ) : null}
                    <th className="px-4 py-3 font-medium">{showHidden ? '숨긴 날' : '경과'}</th>
                    <th className="px-4 py-3 font-medium">질문</th>
                    <th className="px-4 py-3 font-medium">작성자</th>
                    <th className="px-4 py-3 font-medium">공정</th>
                    <th className="px-4 py-3 font-medium">상태</th>
                    <th className="px-4 py-3 font-medium">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-t border-border hover:bg-surface2/50 ${
                        row.isReinquiry ? 'bg-warnSoft/20' : ''
                      }`}
                    >
                      {!showHidden ? (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            aria-label="선택"
                          />
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        {showHidden ? (
                          <span className="text-sm text-muted">{formatDateTime(row.deleted_at)}</span>
                        ) : (
                          <ElapsedBadge createdAt={row.created_at} />
                        )}
                      </td>
                      <td className="max-w-md px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/questions/${row.id}`}
                            className="font-medium text-text hover:text-accent"
                          >
                            {row.preview}
                          </Link>
                          {row.isReinquiry ? <ReinquiryBadge /> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text">{row.displayName}</td>
                      <td className="px-4 py-3 text-muted">{row.process || '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-4 py-3">
                        {showHidden ? (
                          <button
                            type="button"
                            className={btnSecondary}
                            disabled={restoringId === row.id}
                            onClick={() => restoreThread(row.id)}
                          >
                            {restoringId === row.id ? '복원 중…' : '복원'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={btnDanger}
                            onClick={() => openHideDialog([row.id])}
                          >
                            숨기기
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {rows.map((row) => (
                <MobileListCard
                  key={row.id}
                  header={
                    <div className="flex items-start gap-2">
                      {!showHidden ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          className="mt-1"
                          aria-label="선택"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <Link href={`/questions/${row.id}`} className="font-medium text-text hover:text-accent">
                          {row.preview}
                        </Link>
                        {row.isReinquiry ? (
                          <div className="mt-1">
                            <ReinquiryBadge />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  }
                  badge={<StatusBadge status={row.status} />}
                >
                  <MobileCardField label={showHidden ? '숨긴 날' : '경과'}>
                    {showHidden ? formatDateTime(row.deleted_at) : <ElapsedBadge createdAt={row.created_at} />}
                  </MobileCardField>
                  <MobileCardField label="작성자">{row.displayName}</MobileCardField>
                  <MobileCardField label="공정">{row.process || '—'}</MobileCardField>
                  <div className="mt-2">
                    {showHidden ? (
                      <button
                        type="button"
                        className={btnSecondary}
                        disabled={restoringId === row.id}
                        onClick={() => restoreThread(row.id)}
                      >
                        복원
                      </button>
                    ) : (
                      <button type="button" className={btnDanger} onClick={() => openHideDialog([row.id])}>
                        숨기기
                      </button>
                    )}
                  </div>
                </MobileListCard>
              ))}
            </div>
          </>
        )}
      </div>

      {hideDialog ? (
        <ModalShell
          title={hideDialog.threadIds.length > 1 ? '선택 항목 숨기기' : '질문 숨기기'}
          onClose={() => !hiding && setHideDialog(null)}
          maxWidthClass="md:max-w-lg"
          footer={
            <ModalFooterActions
              onCancel={() => setHideDialog(null)}
              onConfirm={confirmHide}
              confirmLabel={hiding ? '처리 중…' : '숨기기'}
              confirmDisabled={hiding || loadingKnowledge}
              confirmClassName="min-h-[44px] rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
            />
          }
        >
          <div className="space-y-4 px-4 py-4 md:px-6">
            <p className="text-sm text-muted">
              {hideDialog.threadIds.length > 1
                ? `선택한 ${hideDialog.threadIds.length}개 질문을 목록에서 숨깁니다. 대화 이력은 삭제되지 않습니다.`
                : '이 질문을 목록에서 숨깁니다. 대화 이력은 삭제되지 않습니다.'}
            </p>

            {loadingKnowledge ? (
              <p className="text-xs text-muted">연결된 지식 확인 중…</p>
            ) : linkedKnowledge.length > 0 ? (
              <div className="rounded-xl border border-border bg-surface2/50 p-3">
                <p className="mb-2 text-xs font-medium text-text">
                  연결된 지식 {linkedKnowledge.length}건
                  {activeLinkedCount > 0 ? ` (활성 ${activeLinkedCount}건)` : ''}
                </p>
                <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
                  {linkedKnowledge.map((k) => (
                    <li key={k.id} className="rounded-lg border border-border bg-surface p-2">
                      <div className="font-medium text-text">Q: {previewText(k.question_text, 60)}</div>
                      <div className="mt-1 text-muted">A: {previewText(k.answer_text, 80)}</div>
                      {!k.is_active ? (
                        <span className="mt-1 inline-block text-[10px] text-muted">이미 비활성</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {activeLinkedCount > 0 ? (
                  <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={deactivateKnowledge}
                      onChange={(e) => setDeactivateKnowledge(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      이 대화로 만들어진 지식 {activeLinkedCount}건도 함께 비활성화합니다 (AI 검색에서
                      제외)
                    </span>
                  </label>
                ) : (
                  <p className="mt-2 text-[11px] text-muted">활성 상태인 연결 지식이 없습니다.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted">이 대화에서 만들어진 지식이 없습니다.</p>
            )}
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
