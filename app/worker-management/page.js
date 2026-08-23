'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, FileText, LayoutGrid, Pencil } from 'lucide-react';
import { useReports } from '../../lib/useReports';
import {
  collectAllWorkerNames,
  collectEveryWorkerName,
  hasResignedNote,
  getWorkerListStatus,
} from '../../lib/analytics';
import {
  WORKER_PROCESSES,
  WORKER_ROLES,
  normalizeWorkerRole,
  normalizeWorkerLang,
} from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import PageHeader from '../../components/PageHeader';
import MobileListCard, { MobileCardField } from '../../components/MobileListCard';
import WorkerEditModal from '../../components/WorkerEditModal';

const inputClass =
  'rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

function hasEquipmentAssigned(row) {
  return Boolean(row?.default_equipment_id);
}

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

function RoleSelect({ name, row, isSaving, onUpsert }) {
  const role = normalizeWorkerRole(row?.role);

  return (
    <select
      value={role}
      disabled={isSaving}
      aria-label={`${name} 역할`}
      onChange={(e) => onUpsert(name, { role: e.target.value })}
      className={`${inputClass} w-full min-w-[6.5rem] md:w-28`}
    >
      {WORKER_ROLES.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
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

function EquipmentSelect({ name, row, equipmentList, isSaving, onUpsert }) {
  const value = row?.default_equipment_id || '';

  return (
    <select
      value={value}
      disabled={isSaving}
      aria-label={`${name} 담당 설비`}
      onChange={(e) =>
        onUpsert(name, {
          default_equipment_id: e.target.value === '' ? null : e.target.value,
        })
      }
      className={`${inputClass} w-full min-w-[9rem] md:w-44 ${value ? '' : 'text-muted'}`}
    >
      <option value="">미지정</option>
      {equipmentList.map((eq) => (
        <option key={eq.id} value={eq.id}>
          {eq.name}
          {eq.line ? ` (${eq.line})` : ''}
        </option>
      ))}
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

function workerDetailHref(name) {
  return `/worker-detail?name=${encodeURIComponent(name)}`;
}

function WorkerNameLink({ name, displayName, className = '' }) {
  const label = displayName.trim() || name;
  return (
    <Link
      href={workerDetailHref(name)}
      className={`font-medium text-text hover:text-accent hover:underline ${className}`.trim()}
      title="작업자 상세 조회"
    >
      {label}
    </Link>
  );
}

function WorkerRow({
  name,
  row,
  showStatus,
  isSaving,
  equipmentList,
  selected,
  onToggleSelect,
  onUpsert,
  onEdit,
}) {
  const excluded = row?.excluded ?? false;
  const displayName = row?.display_name ?? '';
  const unassigned = !hasEquipmentAssigned(row);

  return (
    <tr
      className={`border-b border-border last:border-0 ${
        unassigned ? 'bg-warnSoft/30' : ''
      }`}
    >
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(name)}
          aria-label={`${name} 선택`}
          className="h-4 w-4 rounded border-border"
        />
      </td>
      <td className="px-4 py-3">
        <WorkerNameLink name={name} displayName={displayName} />
        <div className="mt-0.5 flex items-center gap-2 text-[11px]">
          <span className="text-muted">원본: {name}</span>
          <Link href={workerDetailHref(name)} className="text-accent hover:underline">
            상세
          </Link>
        </div>
      </td>
      {showStatus ? (
        <td className="px-4 py-3">
          <WorkerStatusBadge row={row} />
        </td>
      ) : null}
      <td className="px-4 py-3">
        <RoleSelect name={name} row={row} isSaving={isSaving} onUpsert={onUpsert} />
      </td>
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
        <EquipmentSelect
          name={name}
          row={row}
          equipmentList={equipmentList}
          isSaving={isSaving}
          onUpsert={onUpsert}
        />
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

function WorkerMobileCard({
  name,
  row,
  showStatus,
  isSaving,
  equipmentList,
  selected,
  onToggleSelect,
  onUpsert,
  onEdit,
}) {
  const excluded = row?.excluded ?? false;
  const displayName = row?.display_name ?? '';

  return (
    <MobileListCard
      header={<WorkerNameLink name={name} displayName={displayName} />}
      badge={showStatus ? <WorkerStatusBadge row={row} /> : null}
      leading={
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(name)}
          aria-label={`${name} 선택`}
          className="mt-1 h-4 w-4 rounded border-border"
        />
      }
      className={
        excluded
          ? 'border-l-2 border-l-danger'
          : !hasEquipmentAssigned(row)
            ? 'border-l-2 border-l-warn'
            : ''
      }
    >
      <MobileCardField label="원본" className="col-span-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{name}</span>
          <Link href={workerDetailHref(name)} className="text-xs text-accent hover:underline">
            상세
          </Link>
        </div>
      </MobileCardField>
      <MobileCardField label="역할" className="col-span-2">
        <RoleSelect name={name} row={row} isSaving={isSaving} onUpsert={onUpsert} />
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
      <MobileCardField label="담당 설비" className="col-span-2">
        <EquipmentSelect
          name={name}
          row={row}
          equipmentList={equipmentList}
          isSaving={isSaving}
          onUpsert={onUpsert}
        />
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
  const [equipmentList, setEquipmentList] = useState([]);
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [selectedNames, setSelectedNames] = useState(() => new Set());
  const [bulkEquipmentId, setBulkEquipmentId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: eqError } = await supabase
        .from('equipment')
        .select('id, name, line')
        .order('name');
      if (cancelled) return;
      if (eqError) {
        setFormError(eqError.message);
        return;
      }
      setEquipmentList(data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const baseTableNames = useMemo(() => {
    const names = showAllWorkers ? everyNames : visibleNames;
    return showAllWorkers ? sortWorkersActiveFirst(names, directoryMap) : names;
  }, [showAllWorkers, everyNames, visibleNames, directoryMap]);

  const unassignedCount = useMemo(
    () =>
      baseTableNames.filter((name) => !hasEquipmentAssigned(directoryMap.get(name)))
        .length,
    [baseTableNames, directoryMap]
  );

  const tableNames = useMemo(() => {
    if (!filterUnassigned) return baseTableNames;
    return baseTableNames.filter(
      (name) => !hasEquipmentAssigned(directoryMap.get(name))
    );
  }, [baseTableNames, filterUnassigned, directoryMap]);

  const colCount = (showAllWorkers ? 8 : 7) + 2; // checkbox + 담당 설비

  const allVisibleSelected =
    tableNames.length > 0 && tableNames.every((n) => selectedNames.has(n));

  function toggleSelect(name) {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedNames((prev) => {
      if (tableNames.every((n) => prev.has(n))) {
        const next = new Set(prev);
        for (const n of tableNames) next.delete(n);
        return next;
      }
      const next = new Set(prev);
      for (const n of tableNames) next.add(n);
      return next;
    });
  }

  function workerUpsertPayload(worker_name, existing, patch) {
    return {
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
      role: normalizeWorkerRole(existing?.role),
      lang: normalizeWorkerLang(existing?.lang),
      process: existing?.process || null,
      removed: existing?.removed ?? false,
      default_equipment_id: existing?.default_equipment_id ?? null,
      ...patch,
    };
  }

  async function upsertWorker(worker_name, patch) {
    setSaving(worker_name);
    setFormError(null);
    const existing = directoryMap.get(worker_name);
    const { error: upsertError } = await supabase
      .from('worker_directory')
      .upsert(workerUpsertPayload(worker_name, existing, patch));
    setSaving(null);
    if (upsertError) {
      setFormError(upsertError.message);
      return false;
    }
    refetch();
    return true;
  }

  async function handleBulkAssign() {
    const names = [...selectedNames].filter((n) => tableNames.includes(n) || baseTableNames.includes(n));
    if (!names.length) {
      setFormError('설비를 지정할 작업자를 선택하세요.');
      return;
    }
    setBulkSaving(true);
    setFormError(null);
    const equipmentId = bulkEquipmentId === '' ? null : bulkEquipmentId;
    try {
      for (const worker_name of names) {
        const existing = directoryMap.get(worker_name);
        const { error: upsertError } = await supabase
          .from('worker_directory')
          .upsert(
            workerUpsertPayload(worker_name, existing, {
              default_equipment_id: equipmentId,
            })
          );
        if (upsertError) throw new Error(upsertError.message);
      }
      setSelectedNames(new Set());
      setBulkEquipmentId('');
      refetch();
    } catch (err) {
      setFormError(err?.message || '일괄 지정에 실패했습니다.');
    } finally {
      setBulkSaving(false);
    }
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
      role: 'inspector',
      lang: 'ko',
      process: null,
      default_equipment_id: null,
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

    const { error: removeError } = await supabase
      .from('worker_directory')
      .upsert(workerUpsertPayload(name, existing, { removed: true }));
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
        description="역할·근무조·담당업무·공정·담당 설비·제외는 목록에서 바로 바꾸고, 사용언어·국적·별칭·연락처·메모는 편집에서 설정합니다."
      />

      <div className="space-y-6 p-4 md:p-8">
        {unassignedCount > 0 ? (
          <div className="rounded-xl border border-warn/30 bg-warnSoft px-4 py-3 text-sm text-text">
            담당 설비 미지정 {unassignedCount}명 — 이 작업자들의 불량 기록에는 설비 정보가
            남지 않습니다
          </div>
        ) : null}

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
          <button
            type="button"
            onClick={() => setFilterUnassigned((prev) => !prev)}
            className={`min-h-[44px] rounded-full border px-3 py-1.5 text-sm font-medium transition-colors md:min-h-0 ${
              filterUnassigned
                ? 'border-warn/40 bg-warnSoft text-text'
                : 'border-border bg-surface text-muted hover:bg-surface2 hover:text-text'
            }`}
          >
            설비 미지정{unassignedCount > 0 ? ` · ${unassignedCount}` : ''}
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface2/40 px-4 py-3">
          <div className="text-xs text-muted">
            선택 {selectedNames.size}명 · 일괄 담당 설비
          </div>
          <select
            value={bulkEquipmentId}
            disabled={bulkSaving || selectedNames.size === 0}
            onChange={(e) => setBulkEquipmentId(e.target.value)}
            className={`${inputClass} min-w-[10rem]`}
          >
            <option value="">미지정으로</option>
            {equipmentList.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name}
                {eq.line ? ` (${eq.line})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleBulkAssign}
            disabled={bulkSaving || selectedNames.size === 0}
            className="min-h-[44px] rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
          >
            {bulkSaving ? '적용 중...' : '선택에게 적용'}
          </button>
          {selectedNames.size > 0 ? (
            <button
              type="button"
              onClick={() => setSelectedNames(new Set())}
              disabled={bulkSaving}
              className="min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted hover:bg-surface md:min-h-0"
            >
              선택 해제
            </button>
          ) : null}
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
              isSaving={saving === name || bulkSaving}
              equipmentList={equipmentList}
              selected={selectedNames.has(name)}
              onToggleSelect={toggleSelect}
              onUpsert={upsertWorker}
              onEdit={setEditTarget}
            />
          ))}
          {tableNames.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted">
              {filterUnassigned
                ? '설비 미지정 작업자가 없습니다'
                : '등록된 작업자가 없습니다'}
            </div>
          ) : null}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto rounded-xl bg-surface shadow-card md:block">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface2 text-left text-xs font-medium text-muted">
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="현재 목록 전체 선택"
                    className="h-4 w-4 rounded border-border"
                  />
                </th>
                <th className="px-4 py-3">작업자</th>
                {showAllWorkers ? <th className="px-4 py-3">상태</th> : null}
                <th className="px-4 py-3">역할</th>
                <th className="px-4 py-3">근무조</th>
                <th className="px-4 py-3">담당업무</th>
                <th className="px-4 py-3">공정</th>
                <th className="px-4 py-3">담당 설비</th>
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
                  isSaving={saving === name || bulkSaving}
                  equipmentList={equipmentList}
                  selected={selectedNames.has(name)}
                  onToggleSelect={toggleSelect}
                  onUpsert={upsertWorker}
                  onEdit={setEditTarget}
                />
              ))}
              {tableNames.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center text-xs text-muted">
                    {filterUnassigned
                      ? '설비 미지정 작업자가 없습니다'
                      : '등록된 작업자가 없습니다'}
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
          사용되며, 미지정 작업자는 &quot;전체&quot;에서만 보입니다. 담당 설비는 불량 기록에 자동
          연결됩니다. 메모에 &apos;퇴사&apos;가 있으면 기본 목록에서 숨겨집니다.
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
