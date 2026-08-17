'use client';

import { useMemo, useState } from 'react';
import { ClipboardCheck, FileText, LayoutGrid, Pencil } from 'lucide-react';
import { useReports } from '../../lib/useReports';
import {
  collectAllWorkerNames,
  collectEveryWorkerName,
  hasResignedNote,
  getWorkerListStatus,
} from '../../lib/analytics';
import { WORKER_PROCESSES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import PageHeader from '../../components/PageHeader';
import MobileListCard, { MobileCardField } from '../../components/MobileListCard';
import WorkerEditModal from '../../components/WorkerEditModal';

const inputClass =
  'rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

const STATUS_BADGE_CLASS = {
  good: 'bg-goodSoft text-good',
  warn: 'bg-warnSoft text-warn',
  danger: 'bg-dangerSoft text-danger',
  muted: 'bg-surface2 text-muted',
};

/** 활성(excluded=false) 가나다 → 제외(excluded=true) 가나다 */
function sortWorkersActiveFirst(names, directoryMap) {
  return [...names].sort((a, b) => {
    const aExcluded = Boolean(directoryMap.get(a)?.excluded);
    const bExcluded = Boolean(directoryMap.get(b)?.excluded);
    if (aExcluded !== bExcluded) return aExcluded ? 1 : -1;
    return a.localeCompare(b, 'ko');
  });
}

function WorkerStatusBadge({ row }) {
  const { label, tone } = getWorkerListStatus(row);
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_CLASS[tone] ?? STATUS_BADGE_CLASS.muted}`}
    >
      {label}
    </span>
  );
}

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

function DutyIconToggle({ label, active, disabled, onClick, Icon }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-accent/40 bg-accentSoft text-accent'
          : 'border-border bg-surface2 text-muted hover:text-text'
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}

function DutyToggles({ name, row, isSaving, onUpsert }) {
  const handlesFrequent = row?.handles_frequent_check ?? true;
  const handlesFives = row?.handles_fives ?? true;
  const handlesDocuments = row?.handles_documents ?? true;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <DutyIconToggle
        label="자주검사"
        Icon={ClipboardCheck}
        active={handlesFrequent}
        disabled={isSaving}
        onClick={() =>
          onUpsert(name, { handles_frequent_check: !handlesFrequent })
        }
      />
      <DutyIconToggle
        label="3정5S"
        Icon={LayoutGrid}
        active={handlesFives}
        disabled={isSaving}
        onClick={() => onUpsert(name, { handles_fives: !handlesFives })}
      />
      <DutyIconToggle
        label="문서스캔"
        Icon={FileText}
        active={handlesDocuments}
        disabled={isSaving}
        onClick={() => onUpsert(name, { handles_documents: !handlesDocuments })}
      />
    </div>
  );
}

function ShiftSelect({ name, row, isSaving, onUpsert }) {
  const defaultShift =
    row?.default_shift === 'day' || row?.default_shift === 'night'
      ? row.default_shift
      : '';

  return (
    <select
      value={defaultShift}
      disabled={isSaving}
      aria-label={`${name} 근무조`}
      onChange={(e) =>
        onUpsert(name, {
          default_shift: e.target.value === '' ? null : e.target.value,
        })
      }
      className={`${inputClass} w-full min-w-[7.5rem] md:w-36`}
    >
      <option value="">미정(자동판단)</option>
      <option value="day">주간</option>
      <option value="night">야간</option>
    </select>
  );
}

function ProcessSelect({ name, row, isSaving, onUpsert }) {
  const process = row?.process || '';

  return (
    <select
      value={process}
      disabled={isSaving}
      aria-label={`${name} 담당공정`}
      onChange={(e) =>
        onUpsert(name, {
          process: e.target.value === '' ? null : e.target.value,
        })
      }
      className={`${inputClass} w-full min-w-[6.5rem] md:w-32 ${process ? '' : 'text-muted'}`}
    >
      <option value="">미지정</option>
      {WORKER_PROCESSES.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
      {process && !WORKER_PROCESSES.includes(process) ? (
        <option value={process}>{process}</option>
      ) : null}
    </select>
  );
}

function EditButton({ name, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${name} 편집`}
      title="상세 편집"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition-colors hover:border-accent/40 hover:bg-accentSoft hover:text-accent disabled:opacity-50"
    >
      <Pencil className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}

function WorkerRow({ name, row, showStatus, isSaving, onUpsert, onEdit }) {
  const excluded = row?.excluded ?? false;
  const displayName = row?.display_name ?? '';

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium text-text">{displayName.trim() || name}</div>
        <div className="mt-0.5 text-[11px] text-muted">원본: {name}</div>
      </td>
      {showStatus ? (
        <td className="px-4 py-3">
          <WorkerStatusBadge row={row} />
        </td>
      ) : null}
      <td className="px-4 py-3">
        <ShiftSelect name={name} row={row} isSaving={isSaving} onUpsert={onUpsert} />
      </td>
      <td className="px-4 py-3">
        <DutyToggles name={name} row={row} isSaving={isSaving} onUpsert={onUpsert} />
      </td>
      <td className="px-4 py-3">
        <ProcessSelect name={name} row={row} isSaving={isSaving} onUpsert={onUpsert} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <ToggleSwitch
            checked={excluded}
            disabled={isSaving}
            label={`${name} 제외`}
            onChange={(next) => onUpsert(name, { excluded: next })}
          />
          <span className={`text-xs ${excluded ? 'text-danger' : 'text-muted'}`}>
            {excluded ? '제외됨' : '포함'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <EditButton name={name} disabled={isSaving} onClick={() => onEdit(name)} />
      </td>
    </tr>
  );
}

function WorkerMobileCard({ name, row, showStatus, isSaving, onUpsert, onEdit }) {
  const excluded = row?.excluded ?? false;
  const displayName = row?.display_name ?? '';

  return (
    <MobileListCard
      header={displayName.trim() || name}
      badge={showStatus ? <WorkerStatusBadge row={row} /> : null}
      className={excluded ? 'border-l-2 border-l-danger' : ''}
    >
      <MobileCardField label="원본" className="col-span-2">
        <span className="text-xs text-muted">{name}</span>
      </MobileCardField>
      <MobileCardField label="근무조" className="col-span-2">
        <ShiftSelect name={name} row={row} isSaving={isSaving} onUpsert={onUpsert} />
      </MobileCardField>
      <MobileCardField label="담당업무" className="col-span-2">
        <DutyToggles name={name} row={row} isSaving={isSaving} onUpsert={onUpsert} />
      </MobileCardField>
      <MobileCardField label="공정">
        <ProcessSelect name={name} row={row} isSaving={isSaving} onUpsert={onUpsert} />
      </MobileCardField>
      <MobileCardField label="제외">
        <div className="flex items-center gap-2 pt-0.5">
          <ToggleSwitch
            checked={excluded}
            disabled={isSaving}
            label={`${name} 제외`}
            onChange={(next) => onUpsert(name, { excluded: next })}
          />
          <span className={`text-xs ${excluded ? 'text-danger' : 'text-muted'}`}>
            {excluded ? '제외' : '포함'}
          </span>
        </div>
      </MobileCardField>
      <MobileCardField label="상세" className="col-span-2">
        <button
          type="button"
          onClick={() => onEdit(name)}
          disabled={isSaving}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50"
        >
          <Pencil className="h-4 w-4" strokeWidth={2} />
          편집
        </button>
      </MobileCardField>
    </MobileListCard>
  );
}

export default function WorkerManagementPage() {
  const { loading, error, defects, goods, fives, workerDirectory, refetch } = useReports();
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(null);
  const [formError, setFormError] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [hiddenNames, setHiddenNames] = useState(() => new Set());
  const [showAllWorkers, setShowAllWorkers] = useState(false);

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

  const everyNames = useMemo(
    () => collectEveryWorkerName(defects, goods, fives, workerDirectory),
    [defects, goods, fives, workerDirectory]
  );

  const visibleNames = useMemo(() => {
    const names = allNames.filter(
      (name) =>
        !hiddenNames.has(name) && !hasResignedNote(directoryMap.get(name)?.note)
    );
    return sortWorkersActiveFirst(names, directoryMap);
  }, [allNames, hiddenNames, directoryMap]);

  const tableNames = useMemo(() => {
    const names = showAllWorkers ? everyNames : visibleNames;
    return showAllWorkers ? sortWorkersActiveFirst(names, directoryMap) : names;
  }, [showAllWorkers, everyNames, visibleNames, directoryMap]);
  const colCount = showAllWorkers ? 7 : 6;

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
      handles_documents: existing?.handles_documents ?? true,
      handles_defects: existing?.handles_defects ?? existing?.defect_enabled ?? true,
      phone_number: existing?.phone_number ?? '',
      display_name: existing?.display_name ?? '',
      nationality: existing?.nationality ?? '',
      process: existing?.process || null,
      removed: existing?.removed ?? false,
      ...patch,
    });
    setSaving(null);
    if (upsertError) {
      setFormError(upsertError.message);
      return false;
    }
    refetch();
    return true;
  }

  async function handleAddWorker() {
    const name = newName.trim();
    if (!name) return;
    if (directoryMap.has(name) || allNames.includes(name) || everyNames.includes(name)) {
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
      handles_documents: true,
      handles_defects: true,
      phone_number: '',
      display_name: '',
      nationality: '',
      process: null,
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
    setEditTarget(null);

    setHiddenNames((prev) => new Set(prev).add(name));

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
      handles_documents: existing?.handles_documents ?? true,
      handles_defects: existing?.handles_defects ?? existing?.defect_enabled ?? true,
      phone_number: existing?.phone_number ?? '',
      display_name: existing?.display_name ?? '',
      nationality: existing?.nationality ?? '',
      process: existing?.process || null,
      removed: true,
    });
    setSaving(null);

    if (removeError) {
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
        description="근무조·담당업무·공정·제외는 목록에서 바로 바꾸고, 국적·별칭·연락처·메모는 편집에서 설정합니다."
      />

      <div className="space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
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
            className="min-h-[44px] rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
          >
            추가
          </button>
          <button
            type="button"
            onClick={() => setShowAllWorkers((prev) => !prev)}
            className="min-h-[44px] rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 md:min-h-0"
          >
            {showAllWorkers ? '기본 목록으로' : '전체 작업자 목록 보기'}
          </button>
        </div>

        {formError && (
          <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">{formError}</div>
        )}

        {showAllWorkers ? (
          <p className="text-xs text-muted">
            퇴사 메모·제외·숨김 작업자를 포함한 전체 목록입니다. 여기서도 수정 가능합니다.
          </p>
        ) : null}

        {/* Mobile cards */}
        <div className="md:hidden">
          {tableNames.map((name) => (
            <WorkerMobileCard
              key={name}
              name={name}
              row={directoryMap.get(name)}
              showStatus={showAllWorkers}
              isSaving={saving === name}
              onUpsert={upsertWorker}
              onEdit={setEditTarget}
            />
          ))}
          {tableNames.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted">등록된 작업자가 없습니다</div>
          ) : null}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto rounded-xl bg-surface shadow-card md:block">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface2 text-left text-xs font-medium text-muted">
                <th className="px-4 py-3">작업자</th>
                {showAllWorkers ? <th className="px-4 py-3">상태</th> : null}
                <th className="px-4 py-3">근무조</th>
                <th className="px-4 py-3">담당업무</th>
                <th className="px-4 py-3">공정</th>
                <th className="px-4 py-3">제외</th>
                <th className="px-4 py-3">편집</th>
              </tr>
            </thead>
            <tbody>
              {tableNames.map((name) => (
                <WorkerRow
                  key={name}
                  name={name}
                  row={directoryMap.get(name)}
                  showStatus={showAllWorkers}
                  isSaving={saving === name}
                  onUpsert={upsertWorker}
                  onEdit={setEditTarget}
                />
              ))}
              {tableNames.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center text-xs text-muted">
                    등록된 작업자가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted">
          제외된 작업자는 작업자 현황, 자주검사 현황, 대시보드 등 집계 화면에서 표시되지 않습니다.
          표시 이름(별칭)은 화면·엑셀에만 쓰이며, 저장·필터·조회 키는 원본 이름을 유지합니다. 근무조를
          주간/야간으로 고정하면 자동 판단보다 우선 적용됩니다. 담당공정은 현황·대시보드 공정 필터에
          사용되며, 미지정 작업자는 &quot;전체&quot;에서만 보입니다. 메모에 &apos;퇴사&apos;가 있으면
          기본 목록에서 숨겨집니다.
        </p>
      </div>

      {editTarget ? (
        <WorkerEditModal
          workerName={editTarget}
          row={directoryMap.get(editTarget)}
          saving={saving === editTarget}
          onSave={upsertWorker}
          onRequestDelete={handleRemoveWorker}
          onClose={() => setEditTarget(null)}
        />
      ) : null}
    </div>
  );
}
