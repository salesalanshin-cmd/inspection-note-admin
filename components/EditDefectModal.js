'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFECT_CODE_LABELS } from '../lib/constants';

const OTHER_VALUE = '__other__';

export default function EditDefectModal({ report, onClose, onSaved }) {
  // 기존 코드가 알려진 코드 목록에 있으면 그 값을, 아니면 "기타"로 초기화
  const initialIsKnown = report.defect_code && DEFECT_CODE_LABELS[report.defect_code];
  const [code, setCode] = useState(initialIsKnown ? report.defect_code : OTHER_VALUE);
  const [customType, setCustomType] = useState(
    initialIsKnown ? '' : report.defect_type || report.defect_code || ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isOther = code === OTHER_VALUE;

  async function handleSave() {
    setError(null);

    if (isOther && !customType.trim()) {
      setError('불량 유형을 직접 입력해 주세요.');
      return;
    }

    // "기타"면 defect_code는 비우고 직접 입력한 값을 defect_type으로 저장,
    // 알려진 코드면 코드와 함께 한글 라벨을 defect_type에 채워 넣습니다.
    const payload = isOther
      ? { defect_code: null, defect_type: customType.trim() }
      : { defect_code: code, defect_type: DEFECT_CODE_LABELS[code] };

    setSaving(true);
    const { error: updateError } = await supabase
      .from('defect_reports')
      .update(payload)
      .eq('id', report.id);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    onSaved?.();
    onClose?.();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-sm border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 font-mono text-[11px] tracking-[0.25em] text-accent">EDIT</div>
        <h2 className="mb-5 font-display text-lg font-semibold text-text">불량 유형 수정</h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block font-mono text-xs text-muted">불량 코드</label>
            <select
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-sm border border-border bg-surface2 px-3 py-2 font-mono text-sm text-text focus:border-accent focus:outline-none"
            >
              {Object.entries(DEFECT_CODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label} ({value})
                </option>
              ))}
              <option value={OTHER_VALUE}>기타 (직접 입력)</option>
            </select>
          </div>

          {isOther && (
            <div>
              <label className="mb-1.5 block font-mono text-xs text-muted">불량 유형 (직접 입력)</label>
              <input
                type="text"
                value={customType}
                onChange={(e) => setCustomType(e.target.value)}
                placeholder="예: 표면 스크래치"
                className="w-full rounded-sm border border-border bg-surface2 px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
          )}

          {error && (
            <div className="rounded-sm border border-danger/50 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-sm border border-border px-4 py-2 text-sm text-muted transition-colors hover:text-text disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
