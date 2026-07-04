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

export default function WorkerManagementPage() {
  const { loading, error, defects, goods, fives, workerDirectory, refetch } = useReports();
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(null);
  const [formError, setFormError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

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

  async function upsertWorker(worker_name, patch) {
    setSaving(worker_name);
    setFormError(null);
    const existing = directoryMap.get(worker_name);
    const { error: upsertError } = await supabase.from('worker_directory').upsert({
      worker_name,
      excluded: existing?.excluded ?? false,
      note: existing?.note ?? '',
      default_shift:
        existing?.default_shift === 'day' || existing?.default_shift === 'night'
          ? existing.default_shift
          : null,
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
    });
    setSaving(null);
    if (insertError) {
      setFormError(insertError.message);
      return;
    }
    setNewName('');
    refetch();
  }

  async function handleDeleteWorker(name) {
    if (!name) return;
    setSaving(name);
    setFormError(null);
    const { error: deleteError } = await supabase
      .from('worker_directory')
      .delete()
      .eq('worker_name', name);
    setSaving(null);
    setDeleteTarget(null);
    if (deleteError) {
      setFormError(deleteError.message);
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
        description="관리자 제외, 근무조, 메모를 설정합니다. 근무조 미정 시 당일 기록으로 자동 판단합니다."
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
                <th className="px-4 py-3">메모</th>
              </tr>
            </thead>
            <tbody>
              {allNames.map((name) => {
                const row = directoryMap.get(name);
                const excluded = row?.excluded ?? false;
                const note = row?.note ?? '';
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
                          aria-label={`${name} 삭제`}
                          title="작업자 관리 목록에서 삭제"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition-colors hover:border-danger/40 hover:bg-dangerSoft hover:text-danger disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {allNames.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-muted text-xs">
                    등록된 작업자가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted">
          제외된 작업자는 작업자 현황, 자주검사 현황, 대시보드, 불량 기록 등 실적 화면에서 표시되지
          않습니다. 근무조를 주간/야간으로 고정하면 자동 판단보다 우선 적용됩니다.
        </p>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="작업자 삭제"
        message={`${deleteTarget ?? ''}을 작업자 관리 목록에서 삭제하시겠습니까? 이 작업자의 기존 검사/기록 데이터는 삭제되지 않으며, 목록에서만 제거되고 다음에 새 기록이 들어오면 다시 자동으로 나타납니다.`}
        confirmLabel="삭제"
        confirmTone="danger"
        loading={saving === deleteTarget}
        onConfirm={() => handleDeleteWorker(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
