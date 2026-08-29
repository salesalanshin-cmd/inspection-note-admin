'use client';

import { useState } from 'react';
import { MessageCircleQuestion, Send } from 'lucide-react';
import PageHeader from '../../components/PageHeader';

const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0';

const SAMPLE_QUESTIONS = [
  '기포는 무조건 불량인가요?',
  'BA-11 금형 예열 몇 분이에요?',
  '초품 검사는 몇 개 하나요?',
  '우리 회사 연차는 며칠인가요?',
  '월급이 언제 들어오나요?',
];

function StatusBadge({ status }) {
  const tone =
    status === 'answered' ? 'bg-goodSoft text-good' : 'bg-surface2 text-muted';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {status === 'answered' ? 'answered' : 'no_source'}
    </span>
  );
}

function SourceBadge({ source }) {
  return (
    <span className="inline-flex rounded-lg border border-border bg-surface2 px-2.5 py-1 text-xs text-text">
      {source.label}
      <span className="ml-1.5 text-muted">({source.sourceKind})</span>
    </span>
  );
}

export default function AskTestPage() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const submit = async (q) => {
    const text = (q ?? question).trim();
    if (!text || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '요청 실패');
      setResult(data);
      if (q) setQuestion(text);
    } catch (err) {
      setError(err.message || '질문 처리에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        eyebrow="문서 지식베이스"
        title="지식 검색 테스트"
        description="검색·AI 답변 파이프라인 검증용 화면입니다."
      />

      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="rounded-2xl border border-border bg-surface p-4 md:p-6">
            <label className="mb-2 block text-sm font-medium text-text">질문</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder="현장 작업자가 물을 법한 질문을 입력하세요"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {SAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => submit(q)}
                  disabled={loading}
                  className="rounded-lg border border-border bg-surface2 px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-text disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => submit()}
              disabled={loading || !question.trim()}
              className={`${btnPrimary} mt-4`}
            >
              <Send className="h-4 w-4" />
              {loading ? '처리 중...' : '질문하기'}
            </button>
          </div>

          {error ? (
            <div className="rounded-xl border border-danger/30 bg-dangerSoft px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          {result ? (
            <>
              <div className="rounded-2xl border border-border bg-surface p-4 md:p-6">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <MessageCircleQuestion className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium text-text">답변</span>
                  <StatusBadge status={result.status} />
                  {result.blockedLayer ? (
                    <span className="text-xs text-muted">차단: {result.blockedLayer}</span>
                  ) : null}
                  <span className="ml-auto text-xs text-muted">{result.elapsedMs}ms</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">{result.answer}</p>
                {result.sources?.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {result.sources.map((s) => (
                      <SourceBadge key={s.label} source={s} />
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-border bg-surface p-4 md:p-6">
                <h2 className="mb-3 text-sm font-medium text-text">
                  검색된 조각 ({result.hits?.length ?? 0}건)
                </h2>
                {!result.hits?.length ? (
                  <p className="text-sm text-muted">검색 결과 없음</p>
                ) : (
                  <div className="space-y-3">
                    {result.hits.map((hit, i) => (
                      <div
                        key={`${hit.label}-${i}`}
                        className="rounded-xl border border-border bg-surface2 p-3"
                      >
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-text">#{i + 1}</span>
                          <span className="rounded bg-accentSoft px-1.5 py-0.5 text-accent">
                            {(hit.similarity * 100).toFixed(1)}%
                          </span>
                          <span className="text-muted">{hit.sourceKind}</span>
                          {hit.pageFrom != null ? (
                            <span className="text-muted">p.{hit.pageFrom}</span>
                          ) : null}
                        </div>
                        <div className="text-xs font-medium text-text">
                          {hit.sourceLabel || hit.documentTitle || '—'}
                        </div>
                        <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                          {hit.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
