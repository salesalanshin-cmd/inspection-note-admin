'use client';

import { useMemo, useRef, useState } from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { exportDateStamp, exportToExcel } from '../../lib/exportExcel';

const EXAMPLE_PROMPTS = [
  '이번 달 작업자별 불량 건수 알려줘',
  '지난주 3정5S 오염(SOS-006) 기록 몇 건이야?',
  '김태수 최근 30일 불량 유형 분포 보여줘',
  '제외된 작업자 목록 보여줘',
  '이번 주 문서스캔 오류 기록 표로 정리해줘',
];

function rowsToExport(data, columns) {
  if (!data?.length) return [];
  if (!columns?.length) return data;
  return data.map((row) => {
    const out = {};
    for (const col of columns) {
      const val = row[col];
      out[col] = val == null ? '' : String(val);
    }
    return out;
  });
}

function DataPreview({ data, columns }) {
  if (!data?.length) return null;

  const cols = columns?.length ? columns : Object.keys(data[0]);
  const preview = data.slice(0, 10);

  function handleExport() {
    const rows = rowsToExport(data, cols);
    exportToExcel(rows, `인사이트랩_${exportDateStamp()}.xlsx`);
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface2 text-left text-muted">
              {cols.map((col) => (
                <th key={col} className="px-2 py-1.5 font-medium whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i} className="border-t border-border">
                {cols.map((col) => (
                  <td key={col} className="px-2 py-1.5 text-text whitespace-nowrap max-w-[12rem] truncate">
                    {row[col] == null ? '' : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > 10 ? (
        <p className="text-[11px] text-muted">미리보기 10행 / 전체 {data.length}행</p>
      ) : null}
      <button
        type="button"
        onClick={handleExport}
        className="rounded-xl bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
      >
        엑셀로 다운로드 ({data.length}행)
      </button>
    </div>
  );
}

function AiAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#6366F1] shadow-sm">
      <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.25} />
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-xl rounded-br-sm bg-accent px-4 py-3 text-sm text-white shadow-sm">
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2.5">
      <AiAvatar />
      <div className="max-w-[80%] rounded-xl rounded-bl-sm border border-border bg-surface px-4 py-3 text-sm text-text shadow-sm">
        <div className="whitespace-pre-wrap break-words">{message.content}</div>
        {message.data ? <DataPreview data={message.data} columns={message.columns} /> : null}
      </div>
    </div>
  );
}

function InsightLabHeader() {
  return (
    <header className="shrink-0 border-b border-border bg-gradient-to-br from-accent/[0.07] via-[#6366F1]/[0.04] to-transparent px-6 py-3.5">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow-sm">
          AI
        </span>
        <h1 className="text-lg font-semibold tracking-tight text-text">인사이트 랩</h1>
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] leading-snug text-muted">
        <Lock className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2} />
        DB에 저장된 데이터를 기반으로 답변하는 AI 베타 서비스입니다. 조회만 가능하며 데이터를 수정하거나 지우지는 않습니다.
      </p>
    </header>
  );
}

export default function InsightLabPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);

  const apiMessages = useMemo(
    () => messages.map((m) => ({ role: m.role, content: m.content })),
    [messages]
  );

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    const userMessage = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/insight-lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...apiMessages, userMessage] }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error('[insight-lab]', payload.error || res.statusText);
        setError(payload.error || '인사이트 랩을 사용할 수 없습니다. 관리자에게 문의하세요.');
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: payload.reply || '',
          data: payload.data,
          columns: payload.columns,
        },
      ]);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[insight-lab]', err);
      setError('인사이트 랩을 사용할 수 없습니다. 관리자에게 문의하세요.');
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
      });
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden">
      <InsightLabHeader />

      <div className="flex flex-1 flex-col gap-3 p-6 min-h-0">
        <div className="flex flex-nowrap gap-2 shrink-0 overflow-x-auto pb-1">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={loading}
              onClick={() => setInput(prompt)}
              className="shrink-0 whitespace-nowrap rounded-full border border-accent/35 bg-surface px-3 py-1.5 text-xs text-text transition-colors hover:border-accent/50 hover:bg-accentSoft disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        {error ? (
          <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger shrink-0">
            {error}
          </div>
        ) : null}

        <div className="flex flex-1 min-h-0 flex-col rounded-xl bg-gradient-to-br from-accent via-[#6366F1] to-accent/80 p-[2px] shadow-[0_4px_24px_rgba(61,110,245,0.12)]">
          <div className="flex flex-1 min-h-0 flex-col rounded-[10px] bg-surface">
            <div
              ref={listRef}
              className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent/10 to-[#6366F1]/10">
                    <Sparkles className="h-5 w-5 text-accent" strokeWidth={2} />
                  </div>
                  <p className="text-sm text-muted">질문을 입력하거나 위 예시를 선택하세요.</p>
                </div>
              ) : (
                messages.map((msg, idx) => <MessageBubble key={idx} message={msg} />)
              )}
              {loading ? (
                <div className="flex justify-start gap-2.5">
                  <AiAvatar />
                  <div className="rounded-xl rounded-bl-sm border border-border bg-surface2 px-4 py-3 text-sm text-muted">
                    생각 중...
                  </div>
                </div>
              ) : null}
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex gap-2 border-t border-border p-4 shrink-0"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="데이터 조회 질문을 입력하세요..."
                disabled={loading}
                className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-xl bg-gradient-to-r from-accent to-[#6366F1] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 shrink-0"
              >
                전송
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
