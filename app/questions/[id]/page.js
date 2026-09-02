'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Bot, MessageSquare, User, Wrench } from 'lucide-react';
import PageHeader from '../../../components/PageHeader';
import {
  QUESTION_STATUS_LABELS,
  fetchQuestionMessages,
  fetchQuestionThread,
  fetchWorkerProfile,
  formatElapsed,
  getFirstWorkerQuestion,
  isElapsedOver24h,
} from '../../../lib/questions';

const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0';
const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 md:min-h-0';

const ROLE_META = {
  worker: { label: '작업자', icon: User, bubble: 'bg-surface2 text-text' },
  ai: { label: 'AI', icon: Bot, bubble: 'bg-accentSoft text-text' },
  manager: { label: '관리자', icon: Wrench, bubble: 'bg-goodSoft text-text' },
  system: { label: '시스템', icon: MessageSquare, bubble: 'bg-surface2 text-muted' },
};

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR');
}

function SourceBadge({ source }) {
  return (
    <span className="inline-flex rounded-lg border border-border bg-surface px-2 py-0.5 text-[11px] text-muted">
      {source.label || source.documentTitle || '출처'}
      {source.pageFrom != null ? ` (${source.pageFrom}p)` : ''}
    </span>
  );
}

function MessageBubble({ message }) {
  const meta = ROLE_META[message.author_role] || ROLE_META.system;
  const Icon = meta.icon;
  const text = message.body_ko || message.body || '';
  const sources = message.meta?.sources;

  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface2">
        <Icon className="h-4 w-4 text-muted" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-medium text-text">{meta.label}</span>
          {message.author_worker ? <span>{message.author_worker}</span> : null}
          <span>{formatDateTime(message.created_at)}</span>
        </div>
        <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${meta.bubble}`}>
          <p className="whitespace-pre-wrap">{text}</p>
          {message.author_role === 'ai' && Array.isArray(sources) && sources.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {sources.map((s, i) => (
                <SourceBadge key={`${s.label}-${i}`} source={s} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function QuestionDetailPage() {
  const params = useParams();
  const threadId = params.id;

  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [answer, setAnswer] = useState('');
  const [saveKnowledge, setSaveKnowledge] = useState(true);
  const [questionText, setQuestionText] = useState('');
  const [knowledgeAnswerText, setKnowledgeAnswerText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveResult, setSaveResult] = useState(null);

  const firstQuestion = useMemo(() => getFirstWorkerQuestion(messages), [messages]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const t = await fetchQuestionThread(threadId, { allowHidden: true });
      if (!t) {
        setError('질문을 찾을 수 없습니다.');
        return;
      }
      const msgs = await fetchQuestionMessages(threadId);
      const profile = await fetchWorkerProfile(t.created_by_worker, t.company_id);
      setThread(t);
      setMessages(msgs);
      setWorker(profile);
      const q =
        getFirstWorkerQuestion(msgs)?.body_ko ||
        getFirstWorkerQuestion(msgs)?.body ||
        t.title ||
        '';
      setQuestionText(q);
      setError(null);
    } catch (err) {
      setError(err.message || '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setKnowledgeAnswerText(answer);
  }, [answer]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveResult(null);
    try {
      const res = await fetch(`/api/questions/${threadId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answer: trimmed,
          saveKnowledge,
          questionText: questionText.trim(),
          knowledgeAnswerText: knowledgeAnswerText.trim() || trimmed,
          managerName: '관리자',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setSaveResult(data);
      setAnswer('');
      await load();
    } catch (err) {
      setSaveError(err.message || '답변 등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  const canAnswer = thread?.status === 'wait_manager' || thread?.status === 'open';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        eyebrow="현장 Q&A"
        title={thread?.title || '질문 상세'}
        description={
          thread
            ? `${QUESTION_STATUS_LABELS[thread.status] || thread.status} · ${formatElapsed(thread.created_at)} 경과`
            : ''
        }
        actions={
          <Link href="/questions" className={btnSecondary}>
            <ArrowLeft className="h-4 w-4" />
            목록
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        {loading ? (
          <p className="text-sm text-muted">불러오는 중...</p>
        ) : error ? (
          <div className="rounded-xl border border-danger/30 bg-dangerSoft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-surface p-4 md:p-6">
                <h2 className="mb-4 text-sm font-medium text-text">대화</h2>
                <div className="space-y-5">
                  {messages.map((m) => (
                    <MessageBubble key={m.id} message={m} />
                  ))}
                </div>
              </div>

              {canAnswer ? (
                <form
                  onSubmit={handleSubmit}
                  className="rounded-2xl border border-border bg-surface p-4 md:p-6"
                >
                  <h2 className="mb-3 text-sm font-medium text-text">관리자 답변</h2>
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={4}
                    placeholder="작업자에게 전달할 답변을 입력하세요"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />

                  <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={saveKnowledge}
                      onChange={(e) => setSaveKnowledge(e.target.checked)}
                      className="rounded border-border text-accent focus:ring-accent"
                    />
                    지식으로 저장 (다음에 AI가 이 답변을 참고합니다)
                  </label>

                  {saveKnowledge ? (
                    <div className="mt-4 space-y-3 rounded-xl border border-border bg-surface2 p-4">
                      <p className="text-xs text-muted">
                        지식 검색에 쓰일 문구입니다. 구어체를 다듬어 저장하세요.
                      </p>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-text">
                          질문 (검색용)
                        </label>
                        <textarea
                          value={questionText}
                          onChange={(e) => setQuestionText(e.target.value)}
                          rows={2}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-text">
                          답변 (지식 본문)
                        </label>
                        <p className="mb-1 text-[11px] text-muted">
                          현장 작업자가 스마트폰으로 읽습니다. 3~5줄로 짧게 다듬으세요.
                        </p>
                        <textarea
                          value={knowledgeAnswerText}
                          onChange={(e) => setKnowledgeAnswerText(e.target.value)}
                          rows={5}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  ) : null}

                  {saveError ? (
                    <p className="mt-3 text-sm text-danger">{saveError}</p>
                  ) : null}
                  {saveResult?.knowledge?.embeddingError ? (
                    <p className="mt-3 text-sm text-warn">
                      답변은 저장됐으나 임베딩 실패: {saveResult.knowledge.embeddingError}
                    </p>
                  ) : null}
                  {saveResult?.knowledge?.embeddingSaved ? (
                    <p className="mt-3 text-sm text-good">지식 저장 및 임베딩 완료</p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={saving || !answer.trim()}
                    className={`${btnPrimary} mt-4`}
                  >
                    {saving ? '등록 중...' : '답변 등록'}
                  </button>
                </form>
              ) : (
                <div className="rounded-xl border border-border bg-surface2 px-4 py-3 text-sm text-muted">
                  이미 답변이 등록된 질문입니다.
                </div>
              )}
            </div>

            <aside className="space-y-4">
              <div className="rounded-2xl border border-border bg-surface p-4">
                <h3 className="mb-3 text-sm font-medium text-text">작성자</h3>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">이름</dt>
                    <dd className="font-medium text-text">
                      {worker?.displayName || thread?.created_by_worker || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">공정</dt>
                    <dd className="text-text">{worker?.process || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">담당 설비</dt>
                    <dd className="text-text">{worker?.equipmentName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">접수</dt>
                    <dd className="text-text">{formatDateTime(thread?.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">경과</dt>
                    <dd
                      className={`font-semibold ${
                        isElapsedOver24h(thread?.created_at) ? 'text-danger' : 'text-text'
                      }`}
                    >
                      {formatElapsed(thread?.created_at)}
                    </dd>
                  </div>
                </dl>
              </div>

              {firstQuestion ? (
                <div className="rounded-2xl border border-border bg-surface2 p-4 text-sm text-muted">
                  <p className="mb-1 text-xs font-medium text-text">원 질문</p>
                  <p className="whitespace-pre-wrap">{firstQuestion.body_ko || firstQuestion.body}</p>
                </div>
              ) : null}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
