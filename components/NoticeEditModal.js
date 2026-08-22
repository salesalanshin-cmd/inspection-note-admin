'use client';

import { useEffect, useMemo, useState } from 'react';
import ModalShell, { ModalFooterActions } from './ModalShell';
import { getDisplayName } from '../lib/analytics';

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

/**
 * 공지 작성 / 수정 모달
 * - 신규: 제목 · 본문 · 작성자
 * - 수정: 제목 · 본문 · (읽음 있을 때 경고 + 읽음 초기화 옵션, 기본 OFF)
 */
export default function NoticeEditModal({
  open,
  mode = 'create',
  initialTitle = '',
  initialBody = '',
  readCount = 0,
  authorOptions = [],
  workerDirectory = [],
  defaultAuthor = '',
  saving = false,
  onSave,
  onClose,
}) {
  const isEdit = mode === 'edit';
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [author, setAuthor] = useState(defaultAuthor);
  const [resetReads, setResetReads] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setBody(initialBody);
    setAuthor(defaultAuthor);
    setResetReads(false);
    setFormError(null);
  }, [open, initialTitle, initialBody, defaultAuthor]);

  const sortedAuthors = useMemo(() => {
    return [...authorOptions].sort((a, b) => {
      const aMgr = a.role === 'manager' ? 0 : 1;
      const bMgr = b.role === 'manager' ? 0 : 1;
      if (aMgr !== bMgr) return aMgr - bMgr;
      return getDisplayName(a.worker_name, workerDirectory).localeCompare(
        getDisplayName(b.worker_name, workerDirectory),
        'ko'
      );
    });
  }, [authorOptions, workerDirectory]);

  if (!open) return null;

  async function handleSave() {
    setFormError(null);
    try {
      await onSave({
        title,
        body,
        createdByWorker: author,
        resetReads: isEdit ? resetReads : false,
      });
    } catch (err) {
      setFormError(err?.message || '저장에 실패했습니다.');
    }
  }

  return (
    <ModalShell
      title={isEdit ? '공지 수정' : '새 공지'}
      eyebrow="NOTICE"
      onClose={saving ? undefined : onClose}
      ariaLabel={isEdit ? '공지 수정' : '새 공지'}
      maxWidthClass="md:max-w-xl"
      footer={
        <ModalFooterActions
          onCancel={onClose}
          onConfirm={handleSave}
          cancelLabel="취소"
          confirmLabel={saving ? '저장 중...' : '저장'}
          confirmDisabled={saving}
        />
      }
    >
      <div className="space-y-4 px-4 py-5 md:px-6">
        {isEdit && readCount > 0 ? (
          <div className="rounded-xl border border-warn/30 bg-warnSoft px-3 py-3 text-sm text-text">
            이미 {readCount}명이 확인했습니다. 내용을 크게 바꾸려면 새 공지를
            작성하는 편이 좋습니다.
            <label className="mt-3 flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={resetReads}
                disabled={saving}
                onChange={(e) => setResetReads(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              읽음 기록을 초기화합니다 (기본: 끔)
            </label>
          </div>
        ) : null}

        {!isEdit ? (
          <div>
            <label className="mb-1.5 block text-xs text-muted">작성자</label>
            <select
              value={author}
              disabled={saving}
              onChange={(e) => setAuthor(e.target.value)}
              className={inputClass}
            >
              <option value="">선택하세요</option>
              {sortedAuthors.map((row) => (
                <option key={row.worker_name} value={row.worker_name}>
                  {getDisplayName(row.worker_name, workerDirectory)}
                  {row.role === 'manager' ? ' (관리자)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className="mb-1.5 block text-xs text-muted">제목</label>
          <input
            type="text"
            value={title}
            disabled={saving}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="공지 제목"
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-muted">본문</label>
          <textarea
            value={body}
            disabled={saving}
            onChange={(e) => setBody(e.target.value)}
            placeholder="공지 내용 (한국어)"
            rows={10}
            className={`${inputClass} min-h-[180px] resize-y`}
          />
          <p className="mt-1.5 text-[11px] text-muted">
            지금은 한국어로만 작성합니다. 저장 시 body와 body_ko에 같은 값이
            들어갑니다.
          </p>
        </div>

        {formError ? (
          <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">
            {formError}
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
