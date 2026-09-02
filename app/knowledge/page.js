'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, Upload } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import ModalShell, { ModalFooterActions } from '../../components/ModalShell';
import {
  SOURCE_TYPE_LABELS,
  SOURCE_TYPES,
  isKnowledgeUnused,
  needsKnowledgeReview,
  previewText,
} from '../../lib/knowledgeDisplay';

const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0';
const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50 md:min-h-0';

const SOURCE_FILTERS = [
  { id: '', label: '전체 출처' },
  ...SOURCE_TYPES.map((t) => ({ id: t, label: SOURCE_TYPE_LABELS[t] })),
];

const ACTIVE_FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'active', label: '활성' },
  { id: 'inactive', label: '비활성' },
];

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR');
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseKnowledgeCsv(text) {
  const lines = String(text || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/^\ufeff/, ''));
  const rows = lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const row = { _line: index + 2 };
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
  return { headers, rows };
}

function isCsvRowValid(row) {
  return (
    String(row.question_text || '').trim() &&
    String(row.answer_text || '').trim() &&
    String(row.source_label || '').trim()
  );
}

function SignalBadge({ unused, review }) {
  if (review) {
    return (
      <span className="inline-flex rounded-full bg-warnSoft px-2 py-0.5 text-[10px] font-medium text-warn">
        검토 필요
      </span>
    );
  }
  if (unused) {
    return (
      <span className="inline-flex rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-medium text-muted">
        미사용
      </span>
    );
  }
  return null;
}

export default function KnowledgePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [sourceType, setSourceType] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState('latest');

  const [editItem, setEditItem] = useState(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [editSourceLabel, setEditSourceLabel] = useState('');
  const [editMode, setEditMode] = useState('overwrite');
  const [savingEdit, setSavingEdit] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createQuestion, setCreateQuestion] = useState('');
  const [createAnswer, setCreateAnswer] = useState('');
  const [createSourceLabel, setCreateSourceLabel] = useState('');
  const [creating, setCreating] = useState(false);

  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState([]);
  const [csvSkipped, setCsvSkipped] = useState(0);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (sourceType) params.set('sourceType', sourceType);
      if (activeFilter !== 'all') params.set('active', activeFilter);
      if (search.trim()) params.set('search', search.trim());
      if (sort === 'helpful') params.set('sort', 'helpful');

      const res = await fetch(`/api/knowledge?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '목록 조회 실패');
      setItems(json.items || []);
      setError(null);
    } catch (err) {
      setError(err.message || '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [sourceType, activeFilter, search, sort]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const parsedCsv = useMemo(() => parseKnowledgeCsv(csvText), [csvText]);

  useEffect(() => {
    const valid = parsedCsv.rows.filter(isCsvRowValid);
    const skipped = parsedCsv.rows.length - valid.length;
    setCsvPreview(valid.slice(0, 20));
    setCsvSkipped(skipped);
  }, [parsedCsv]);

  function openEdit(item) {
    setEditItem(item);
    setEditQuestion(item.question_text || '');
    setEditAnswer(item.answer_text || '');
    setEditSourceLabel(item.source_label || '');
    setEditMode('overwrite');
  }

  async function saveEdit() {
    if (!editItem || savingEdit) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/knowledge/${editItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionText: editQuestion,
          answerText: editAnswer,
          sourceLabel: editSourceLabel,
          mode: editMode,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '저장 실패');
      setEditItem(null);
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function toggleActive(item) {
    if (togglingId) return;
    setTogglingId(item.id);
    try {
      const res = await fetch(`/api/knowledge/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '변경 실패');
      setItems((prev) =>
        prev.map((k) => (k.id === item.id ? { ...k, is_active: !item.is_active } : k))
      );
    } catch (err) {
      alert(err.message);
    } finally {
      setTogglingId(null);
    }
  }

  async function submitCreate() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionText: createQuestion,
          answerText: createAnswer,
          sourceLabel: createSourceLabel,
          sourceType: 'doc',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '등록 실패');
      if (!json.embeddingSaved) {
        alert(`등록됐으나 임베딩 실패: ${json.embeddingError || '알 수 없음'}`);
      }
      setShowCreate(false);
      setCreateQuestion('');
      setCreateAnswer('');
      setCreateSourceLabel('');
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function submitBulk() {
    if (bulkImporting) return;
    const validRows = parsedCsv.rows.filter(isCsvRowValid);
    if (!validRows.length) {
      alert('등록 가능한 행이 없습니다. 필수 컬럼을 확인하세요.');
      return;
    }
    if (!window.confirm(`${validRows.length}건을 등록할까요?`)) return;

    setBulkImporting(true);
    setBulkResult(null);
    try {
      const res = await fetch('/api/knowledge/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '일괄 등록 실패');
      setBulkResult(json);
      setCsvText('');
      await load();
    } catch (err) {
      alert(err.message);
    } finally {
      setBulkImporting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        eyebrow="KNOWLEDGE BASE"
        title="지식 관리"
        description="AI 검색에 쓰이는 Q&A 지식을 확인·수정·비활성화합니다. 삭제는 지원하지 않습니다."
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowCreate(true)} className={btnPrimary}>
              <Plus className="h-4 w-4" />
              직접 등록
            </button>
            <button type="button" onClick={load} className={btnSecondary}>
              <RefreshCw className="h-4 w-4" />
              새로고침
            </button>
          </div>
        }
      />

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6 md:px-8">
        {error ? (
          <div className="rounded-xl border border-danger/30 bg-dangerSoft px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="질문·답변 검색"
            className="min-w-[200px] flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm md:max-w-xs"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="latest">최신순</option>
            <option value="helpful">도움됨 순</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {SOURCE_FILTERS.map((f) => (
            <button
              key={f.id || 'all'}
              type="button"
              onClick={() => setSourceType(f.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                sourceType === f.id
                  ? 'bg-accentSoft text-accent'
                  : 'bg-surface2 text-muted hover:text-text'
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="mx-1 w-px self-stretch bg-border" />
          {ACTIVE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveFilter(f.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                activeFilter === f.id
                  ? 'bg-accentSoft text-accent'
                  : 'bg-surface2 text-muted hover:text-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-surface2 text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">질문</th>
                <th className="px-4 py-3 font-medium">답변 미리보기</th>
                <th className="px-4 py-3 font-medium">출처</th>
                <th className="px-4 py-3 font-medium">등록일</th>
                <th className="px-4 py-3 font-medium">신호</th>
                <th className="px-4 py-3 font-medium">활성</th>
                <th className="px-4 py-3 font-medium">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted">
                    불러오는 중…
                  </td>
                </tr>
              ) : null}
              {!loading &&
                items.map((item) => {
                  const unused = isKnowledgeUnused(item.last_hit_at);
                  const review = needsKnowledgeReview(item.helpful_count, item.unhelpful_count);
                  return (
                    <tr
                      key={item.id}
                      className={!item.is_active ? 'opacity-60' : undefined}
                    >
                      <td className="max-w-[200px] px-4 py-3 font-medium text-text">
                        {previewText(item.question_text, 60)}
                      </td>
                      <td className="max-w-[240px] px-4 py-3 text-muted">
                        {previewText(item.answer_text, 80)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-text">{item.source_label || '—'}</div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
                          <span>{SOURCE_TYPE_LABELS[item.source_type] || item.source_type}</span>
                          {item.created_from_thread_id ? (
                            <>
                              <span className="inline-flex rounded-full bg-surface2 px-1.5 py-0.5 font-medium text-muted">
                                현장 Q&A
                              </span>
                              <Link
                                href={`/questions/${item.created_from_thread_id}`}
                                className="text-accent hover:underline"
                              >
                                원본 대화
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {formatDateTime(item.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <SignalBadge unused={unused} review={review} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={togglingId === item.id}
                          onClick={() => toggleActive(item)}
                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                            item.is_active ? 'bg-accent' : 'bg-surface2'
                          }`}
                          aria-label={item.is_active ? '비활성화' : '활성화'}
                        >
                          <span
                            className={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${
                              item.is_active ? 'translate-x-5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" className={btnSecondary} onClick={() => openEdit(item)}>
                          수정
                        </button>
                      </td>
                    </tr>
                  );
                })}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted">
                    표시할 지식이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* CSV 일괄 등록 */}
        <div className="rounded-xl border border-dashed border-border bg-surface2/50 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text">
            <Upload className="h-4 w-4" />
            CSV 일괄 등록
          </div>
          <p className="mb-3 text-xs text-muted">
            컬럼: question_text, answer_text, source_label, valid_until (선택). 필수값 누락 행은
            건너뜁니다. 등록과 동시에 배치 임베딩합니다.
          </p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={5}
            placeholder={`question_text,answer_text,source_label,valid_until\nGR001은 무엇인가요?,GR001은...,표준작업서 4.1,`}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs"
          />
          {parsedCsv.rows.length > 0 ? (
            <div className="mt-3 space-y-2 text-xs">
              <p className="text-muted">
                미리보기: {parsedCsv.rows.filter(isCsvRowValid).length}건 등록 가능
                {csvSkipped > 0 ? ` · ${csvSkipped}건 건너뜀` : ''}
              </p>
              <ul className="max-h-40 overflow-y-auto rounded-lg border border-border bg-surface divide-y divide-border">
                {csvPreview.map((row, i) => (
                  <li key={i} className="px-3 py-2">
                    <span className="font-medium text-text">{previewText(row.question_text, 40)}</span>
                    <span className="text-muted"> → {previewText(row.answer_text, 40)}</span>
                    <span className="ml-2 text-[10px] text-accent">[{row.source_label}]</span>
                  </li>
                ))}
                {parsedCsv.rows.filter(isCsvRowValid).length > 20 ? (
                  <li className="px-3 py-2 text-muted">… 외 {parsedCsv.rows.filter(isCsvRowValid).length - 20}건</li>
                ) : null}
              </ul>
              <button
                type="button"
                className={btnPrimary}
                disabled={bulkImporting || !parsedCsv.rows.filter(isCsvRowValid).length}
                onClick={submitBulk}
              >
                {bulkImporting ? '등록 중…' : '일괄 등록'}
              </button>
              {bulkResult ? (
                <p className="text-good">
                  {bulkResult.created}건 등록
                  {bulkResult.skipped ? ` · ${bulkResult.skipped}건 건너뜀` : ''}
                  {bulkResult.embeddingErrors ? ` · 임베딩 실패 ${bulkResult.embeddingErrors}건` : ''}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* 직접 등록 */}
      {showCreate ? (
        <ModalShell
          title="지식 직접 등록"
          onClose={() => !creating && setShowCreate(false)}
          footer={
            <ModalFooterActions
              onCancel={() => setShowCreate(false)}
              onConfirm={submitCreate}
              confirmLabel={creating ? '등록 중…' : '등록'}
              confirmDisabled={creating || !createQuestion.trim() || !createAnswer.trim() || !createSourceLabel.trim()}
            />
          }
        >
          <div className="space-y-4 px-4 py-4 md:px-6">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">질문</label>
              <input
                value={createQuestion}
                onChange={(e) => setCreateQuestion(e.target.value)}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                placeholder="작업자가 물을 법한 질문"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">답변</label>
              <textarea
                value={createAnswer}
                onChange={(e) => setCreateAnswer(e.target.value)}
                rows={5}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                placeholder="현장에서 바로 읽을 수 있는 답변"
              />
              <p className="mt-1 text-[11px] text-muted">
                3~5줄 권장. 스마트폰으로 읽는 현장 작업자용 — 짧고 구체적으로 작성하세요.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                출처 라벨 <span className="text-danger">*</span>
              </label>
              <input
                value={createSourceLabel}
                onChange={(e) => setCreateSourceLabel(e.target.value)}
                required
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
                placeholder="표준작업서 4.1"
              />
              <p className="mt-1 text-[11px] text-muted">
                앱 출처 배지에 표시됩니다. 사람이 검증 가능한 문자열이어야 합니다.
              </p>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {/* 수정 */}
      {editItem ? (
        <ModalShell
          title="지식 수정"
          onClose={() => !savingEdit && setEditItem(null)}
          footer={
            <ModalFooterActions
              onCancel={() => setEditItem(null)}
              onConfirm={saveEdit}
              confirmLabel={savingEdit ? '저장 중…' : '저장'}
              confirmDisabled={
                savingEdit ||
                !editQuestion.trim() ||
                !editAnswer.trim() ||
                !editSourceLabel.trim()
              }
            />
          }
        >
          <div className="space-y-4 px-4 py-4 md:px-6">
            <div className="rounded-xl bg-surface2/80 px-3 py-2 text-xs text-muted">
              <p className="mb-2 font-medium text-text">저장 방식</p>
              <label className="mb-1 flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="editMode"
                  checked={editMode === 'overwrite'}
                  onChange={() => setEditMode('overwrite')}
                  className="mt-0.5"
                />
                <span>
                  <strong className="text-text">현재 항목 수정</strong> — 오타·소폭 수정. 같은 행을
                  갱신하고 질문 텍스트를 재임베딩합니다.
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="editMode"
                  checked={editMode === 'supersede'}
                  onChange={() => setEditMode('supersede')}
                  className="mt-0.5"
                />
                <span>
                  <strong className="text-text">새 버전으로 저장</strong> — 내용 변경. 새 행을 만들고
                  이전 버전은 비활성·superseded_by 로 보존합니다.
                </span>
              </label>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">질문</label>
              <textarea
                value={editQuestion}
                onChange={(e) => setEditQuestion(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">답변</label>
              <textarea
                value={editAnswer}
                onChange={(e) => setEditAnswer(e.target.value)}
                rows={5}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-muted">3~5줄 권장 (현장 스마트폰 가독성)</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">출처 라벨</label>
              <input
                value={editSourceLabel}
                onChange={(e) => setEditSourceLabel(e.target.value)}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
