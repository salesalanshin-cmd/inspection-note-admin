'use client';

import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useReports } from '../../lib/useReports';
import { collectAllWorkerNames, getExcludedWorkerNames } from '../../lib/analytics';
import { supabase } from '../../lib/supabase';
import PageHeader from '../../components/PageHeader';
import ConfirmDialog from '../../components/ConfirmDialog';

const inputClass =
  'rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

function ToggleSwitch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-accent' : 'bg-border'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function DutyPill({ label, active, disabled, onClick }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'bg-accent text-white' : 'bg-surface2 text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}

export default function WorkerManagementPage() {
  const { loading, error, defects, goods, fives, workerDirectory, refetch } = useReports();
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(null);
  const [formError, setFormError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [hiddenNames, setHiddenNames] = useState(() => new Set());

  const directoryMap = useMemo(() => {
    const map = new Map();
    for (const row of workerDirectory) {
      if (row.worker_name) map.set(row.worker_name, row);
    }
    return map;
  }, [workerDirectory]);

  const allNames = useMemo(
    () => collectAllWorkerNames(defects, goods, fives, workerDirectory),
    [defects, goods, fives, workerDirectory]
  );

  // 낙관적 업데이트: 숨김 처리 직후 refetch 전까지 즉시 목록에서 제거
  const visibleNames = useMemo(
    () => allNames.filter((name) => !hiddenNames.has(name)),
    [allNames, hiddenNames]
  );

  async function upsertWorker(worker_name, patch) {
    setSaving(worker_name);
    setFormError(null);
    const existing = directoryMap.get(worker_name);
    // upsert는 행 전체를 덮어쓰므로 지정하지 않은 컬럼이 초기화되지 않도록
    // 기존 값(담당 업무, 연락처 포함)을 모두 base에 채워 넣습니다.
    const { error: upsertError } = await supabase.from('worker_directory').upsert({
      worker_name,
      excluded: existing?.excluded ?? false,
      note: existing?.note ?? '',
      default_shift:
        existing?.default_shift === 'day' || existing?.default_shift === 'night'
          ? existing.default_shift
          : null,
      handles_frequent_check: existing?.handles_frequent_check ?? true,
      handles_fives: existing?.handles_fives ?? true,
      handles_documents: existing?.handles_documents ?? false,
      handles_defects: existing?.handles_defects ?? existing?.defect_enabled ?? true,
      phone_number: existing?.phone_number ?? '',
      removed: existing?.removed ?? false,
      ...patch,
    });
    setSaving(null);
    if (upsertError) {
      setFormError(upsertError.message);
      return;
    }
    refetch();
  }

  async function handleAddWorker() {
    const name = newName.trim();
    if (!name) return;
    if (directoryMap.has(name) || allNames.includes(name)) {
      setFormError('이미 목록에 있는 작업자입니다.');
      return;
    }
    setSaving('__new__');
    setFormError(null);
    const { error: insertError } = await supabase.from('worker_directory').insert({
      worker_name: name,
      excluded: false,
      note: '',
      default_shift: null,
      handles_frequent_check: true,
      handles_fives: true,
      handles_documents: false,
      handles_defects: true,
      phone_number: '',
    });
    setSaving(null);
    if (insertError) {
      setFormError(insertError.message);
      return;
    }
    setNewName('');
    refetch();
  }

  async function handleRemoveWorker(name) {
    if (!name) return;
    const existing = directoryMap.get(name);
    setSaving(name);
    setFormError(null);
    setDeleteTarget(null);

    // 낙관적 업데이트: 즉시 화면 목록에서 숨김
    setHiddenNames((prev) => new Set(prev).add(name));

    // 실제 delete가 아니라 removed=true로 숨김 처리 (기록이 있는 작업자는
    // delete 시 다음 새로고침에 재생성되므로). 기존 설정값은 유지합니다.
    const { error: removeError } = await supabase.from('worker_directory').upsert({
      worker_name: name,
      excluded: existing?.excluded ?? false,
      note: existing?.note ?? '',
      default_shift:
        existing?.default_shift === 'day' || existing?.default_shift === 'night'
          ? existing.default_shift
          : null,
      handles_frequent_check: existing?.handles_frequent_check ?? true,
      handles_fives: existing?.handles_fives ?? true,
      handles_documents: existing?.handles_documents ?? false,
      handles_defects: existing?.handles_defects ?? existing?.defect_enabled ?? true,
      phone_number: existing?.phone_number ?? '',
      removed: true,
    });
    setSaving(null);

    if (removeError) {
      // 롤백
      setHiddenNames((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      setFormError(removeError.message);
      return;
    }
    refetch();
  }

  if (loading) return <div className="p-8 text-muted text-sm">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-danger text-sm">오류: {error}</div>;

  return (
    <div>
      <PageHeader
        eyebrow="SETTINGS"
        title="작업자 관리"
        description="관리자 제외, 근무조, 담당 업무, 연락처, 메모를 설정합니다. 근무조 미정 시 당일 기록으로 자동 판단합니다."
      />

      <div className="p-8 space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1.5 block text-xs text-muted">새 작업자 이름 직접 추가</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddWorker();
              }}
              placeholder="예: 홍길동"
              className={`${inputClass} w-full max-w-xs`}
            />
          </div>
          <button
            type="button"
            onClick={handleAddWorker}
            disabled={!newName.trim() || saving === '__new__'}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            추가
          </button>
        </div>

        {formError && (
          <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">{formError}</div>
        )}

        <div className="bg-surface rounded-xl shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted bg-surface2">
                <th className="px-4 py-3">작업자</th>
                <th className="px-4 py-3">제외 (관리자/퇴사자 등)</th>
                <th className="px-4 py-3">근무조</th>
                <th className="px-4 py-3">담당 업무</th>
                <th className="px-4 py-3">연락처</th>
                <th className="px-4 py-3">메모</th>
              </tr>
            </thead>
            <tbody>
              {visibleNames.map((name) => {
                const row = directoryMap.get(name);
                const excluded = row?.excluded ?? false;
                const note = row?.note ?? '';
                const phone = row?.phone_number ?? '';
                const handlesFrequent = row?.handles_frequent_check ?? true;
                const handlesFives = row?.handles_fives ?? true;
                const handlesDocuments = row?.handles_documents ?? false;
                const handlesDefects = row?.handles_defects ?? row?.defect_enabled ?? true;
                const defaultShift =
                  row?.default_shift === 'day' || row?.default_shift === 'night'
                    ? row.default_shift
                    : '';
                const isSaving = saving === name;

                return (
                  <tr key={name} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-text">{name}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ToggleSwitch
                          checked={excluded}
                          disabled={isSaving}
                          label={`${name} 제외`}
                          onChange={(next) => upsertWorker(name, { excluded: next, note })}
                        />
                        <span className={`text-xs ${excluded ? 'text-danger' : 'text-muted'}`}>
                          {excluded ? '제외됨' : '포함'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={defaultShift}
                        disabled={isSaving}
                        onChange={(e) =>
                          upsertWorker(name, {
                            excluded,
                            note,
                            default_shift: e.target.value === '' ? null : e.target.value,
                          })
                        }
                        className={`${inputClass} w-36`}
                      >
                        <option value="">미정(자동판단)</option>
                        <option value="day">주간</option>
                        <option value="night">야간</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <DutyPill
                          label="자주검사"
                          active={handlesFrequent}
                          disabled={excluded || isSaving}
                          onClick={() =>
                            upsertWorker(name, {
                              handles_frequent_check: !handlesFrequent,
                            })
                          }
                        />
                        <DutyPill
                          label="3정5S"
                          active={handlesFives}
                          disabled={excluded || isSaving}
                          onClick={() =>
                            upsertWorker(name, { handles_fives: !handlesFives })
                          }
                        />
                        <DutyPill
                          label="문서스캔"
                          active={handlesDocuments}
                          disabled={excluded || isSaving}
                          onClick={() =>
                            upsertWorker(name, {
                              handles_documents: !handlesDocuments,
                            })
                          }
                        />
                        <DutyPill
                          label="불량관리"
                          active={handlesDefects}
                          disabled={isSaving}
                          onClick={() =>
                            upsertWorker(name, {
                              handles_defects: !handlesDefects,
                            })
                          }
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        defaultValue={phone}
                        disabled={isSaving}
                        placeholder="010-0000-0000"
                        className={`${inputClass} w-36`}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next !== phone) {
                            upsertWorker(name, { phone_number: next });
                          }
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          defaultValue={note}
                          disabled={isSaving}
                          placeholder="관리자, 퇴사, 야간조…"
                          className={`${inputClass} w-full max-w-xs`}
                          onBlur={(e) => {
                            const next = e.target.value;
                            if (next !== note) {
                              upsertWorker(name, { excluded, note: next });
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(name)}
                          disabled={isSaving}
                          aria-label={`${name} 숨김`}
                          title="작업자 관리 목록에서 숨김"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition-colors hover:border-danger/40 hover:bg-dangerSoft hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleNames.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted text-xs">
                    등록된 작업자가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted">
          제외된 작업자는 작업자 현황, 자주검사 현황, 대시보드 등 실적 화면에서 표시되지 않습니다.
          단, 불량관리가 켜져 있으면 불량 기록 페이지에는 해당 작업자 데이터가 표시됩니다. 근무조를
          주간/야간으로 고정하면 자동 판단보다 우선 적용됩니다.
        </p>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="작업자 숨김"
        message={`${deleteTarget ?? ''}을 작업자 관리 목록에서 숨김 처리하시겠습니까? 목록에서만 숨김 처리되며, 검사 데이터는 유지됩니다.`}
        confirmLabel="숨김"
        confirmTone="danger"
        loading={saving === deleteTarget}
        onConfirm={() => handleRemoveWorker(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
