'use client';

import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import ModalShell, { ModalFooterActions } from './ModalShell';
import ConfirmDialog from './ConfirmDialog';
import {
  NATIONALITY_LANG_HINTS,
  WORKER_LANGS,
  normalizeWorkerLang,
  workerLangLabel,
  workerRoleLabel,
} from '../lib/constants';

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

const NATIONALITY_PRESETS = [
  '한국',
  '베트남',
  '캄보디아',
  '우즈베키스탄',
  '태국',
  '네팔',
  '인도네시아',
  '중국',
];

function shiftLabel(defaultShift) {
  if (defaultShift === 'day') return '주간';
  if (defaultShift === 'night') return '야간';
  return '미정(자동판단)';
}

function dutySummary(row) {
  const parts = [];
  if (row?.handles_frequent_check ?? true) parts.push('자주검사');
  if (row?.handles_fives ?? true) parts.push('3정5S');
  if (row?.handles_documents ?? true) parts.push('문서스캔');
  return parts.length ? parts.join(' · ') : '없음';
}

function NationalityField({ value, onChange, disabled }) {
  const current = value || '';
  const isPreset = current === '' || NATIONALITY_PRESETS.includes(current);
  const [mode, setMode] = useState(isPreset ? 'preset' : 'custom');
  const [custom, setCustom] = useState(isPreset ? '' : current);

  useEffect(() => {
    const next = value || '';
    const preset = next === '' || NATIONALITY_PRESETS.includes(next);
    setMode(preset ? 'preset' : 'custom');
    setCustom(preset ? '' : next);
  }, [value]);

  const selectValue = mode === 'custom' ? '__custom__' : current;

  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={selectValue}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value;
          if (next === '__custom__') {
            setMode('custom');
            return;
          }
          setMode('preset');
          setCustom('');
          onChange(next);
        }}
        className={inputClass}
      >
        <option value="">미지정</option>
        {NATIONALITY_PRESETS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value="__custom__">직접입력…</option>
      </select>
      {mode === 'custom' ? (
        <input
          type="text"
          value={custom}
          disabled={disabled}
          placeholder="국적 직접 입력"
          className={inputClass}
          onChange={(e) => setCustom(e.target.value)}
          onBlur={() => onChange(custom.trim())}
        />
      ) : null}
    </div>
  );
}

/**
 * 작업자 상세 편집 모달 (국적·별칭·연락처·메모·숨김)
 * 근무조/담당업무/공정은 참고용 요약만 표시 — 인라인 테이블에서 수정
 */
export default function WorkerEditModal({
  workerName,
  row,
  saving,
  onSave,
  onRequestDelete,
  onClose,
}) {
  const [displayName, setDisplayName] = useState(row?.display_name ?? '');
  const [nationality, setNationality] = useState(row?.nationality ?? '');
  const [lang, setLang] = useState(() => normalizeWorkerLang(row?.lang));
  const [phone, setPhone] = useState(row?.phone_number ?? '');
  const [note, setNote] = useState(row?.note ?? '');
  const [handlesDefects, setHandlesDefects] = useState(
    row?.handles_defects ?? row?.defect_enabled ?? true
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDisplayName(row?.display_name ?? '');
    setNationality(row?.nationality ?? '');
    setLang(normalizeWorkerLang(row?.lang));
    setPhone(row?.phone_number ?? '');
    setNote(row?.note ?? '');
    setHandlesDefects(row?.handles_defects ?? row?.defect_enabled ?? true);
    setError(null);
    setConfirmDelete(false);
  }, [workerName, row]);

  const processLabel = row?.process || '미지정';
  const roleLabel = workerRoleLabel(row?.role);
  const defaultShift =
    row?.default_shift === 'day' || row?.default_shift === 'night'
      ? row.default_shift
      : '';

  const langHint = useMemo(() => {
    const nat = nationality.trim();
    if (!nat || lang !== 'ko') return null;
    const suggested = NATIONALITY_LANG_HINTS[nat];
    if (!suggested) return null;
    return {
      suggested,
      label: workerLangLabel(suggested),
    };
  }, [nationality, lang]);

  async function handleSave() {
    setError(null);
    const ok = await onSave(workerName, {
      display_name: displayName.trim(),
      nationality: nationality.trim(),
      lang,
      phone_number: phone.trim(),
      note,
      handles_defects: handlesDefects,
    });
    if (ok === false) return;
    onClose();
  }

  return (
    <>
      <ModalShell
        title={row?.display_name?.trim() || workerName}
        eyebrow="WORKER"
        onClose={onClose}
        ariaLabel={`${workerName} 편집`}
        maxWidthClass="md:max-w-lg"
        footer={
          <ModalFooterActions
            onCancel={onClose}
            onConfirm={handleSave}
            cancelLabel="취소"
            confirmLabel={saving ? '저장 중…' : '저장'}
            confirmDisabled={saving}
          />
        }
      >
        <div className="space-y-5 px-4 py-5 md:px-6">
          <div className="rounded-xl border border-border bg-surface2/50 px-3 py-3">
            <p className="text-[11px] font-medium text-muted">원본 이름</p>
            <p className="mt-0.5 text-sm font-medium text-text">{workerName}</p>
            <p className="mt-3 text-[11px] font-medium text-muted">목록에서 바로 수정</p>
            <dl className="mt-1.5 space-y-1 text-xs text-text">
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted">역할</dt>
                <dd>{roleLabel}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted">근무조</dt>
                <dd>{shiftLabel(defaultShift)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted">담당업무</dt>
                <dd>{dutySummary(row)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted">공정</dt>
                <dd className={row?.process ? '' : 'text-muted'}>{processLabel}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              역할·근무조·담당업무·공정은 목록에서 인라인으로 변경하세요.
            </p>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">표시 이름(별칭)</span>
            <input
              type="text"
              value={displayName}
              disabled={saving}
              placeholder={workerName}
              title="비워두면 원래 이름 그대로 사용됩니다"
              className={inputClass}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted">국적</span>
            <NationalityField
              value={nationality}
              disabled={saving}
              onChange={setNationality}
            />
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">사용 언어</span>
            <select
              value={lang}
              disabled={saving}
              onChange={(e) => setLang(e.target.value)}
              className={inputClass}
            >
              {WORKER_LANGS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {langHint ? (
              <p className="text-[11px] leading-relaxed text-warn">
                국적이 {nationality.trim()}입니다. 언어를 {langHint.suggested}({langHint.label}
                )로 변경하시겠습니까?
              </p>
            ) : null}
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">연락처</span>
            <input
              type="text"
              value={phone}
              disabled={saving}
              placeholder="010-0000-0000"
              className={inputClass}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted">메모</span>
            <input
              type="text"
              value={note}
              disabled={saving}
              placeholder="관리자, 퇴사, 야간조…"
              className={inputClass}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-3">
            <div>
              <p className="text-sm font-medium text-text">불량관리</p>
              <p className="mt-0.5 text-[11px] text-muted">
                꺼두면 불량 기록 목록에서 이 작업자가 빠집니다.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={handlesDefects}
              aria-label="불량관리"
              disabled={saving}
              onClick={() => setHandlesDefects((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                handlesDefects ? 'bg-accent' : 'bg-border'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  handlesDefects ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {error ? (
            <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">{error}</div>
          ) : null}

          <div className="border-t border-border pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirmDelete(true)}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-danger/30 bg-dangerSoft px-4 py-2 text-sm font-medium text-danger transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0 md:w-auto"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2} />
              목록에서 숨김
            </button>
            <p className="mt-2 text-[11px] text-muted">
              목록에서만 숨기며, 검사 데이터는 유지됩니다.
            </p>
          </div>
        </div>
      </ModalShell>

      <ConfirmDialog
        open={confirmDelete}
        title="작업자 숨김"
        message={`${workerName}을 작업자 관리 목록에서 숨김 처리하시겠습니까? 목록에서만 숨김 처리되며, 검사 데이터는 유지됩니다.`}
        confirmLabel="숨김"
        confirmTone="danger"
        loading={saving}
        onConfirm={async () => {
          setConfirmDelete(false);
          await onRequestDelete(workerName);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
