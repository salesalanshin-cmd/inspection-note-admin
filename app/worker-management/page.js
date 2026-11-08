'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, FileText, LayoutGrid, Pencil } from 'lucide-react';
import { useReports } from '../../lib/useReports';
import { attendanceCardPath } from '../../lib/attendance/card';
import { formatKstISODate } from '../../lib/kst';
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
import { getCompanyId } from '../../lib/company';
import { supabase } from '../../lib/supabase';
import {
  MSG_ALREADY_REGISTERED,
  MSG_RESTORE_CONFIRM,
  buildNewWorkerRow,
  buildRestorePatch,
  classifyWorkerImport,
  isWorkerSetupIncomplete,
  matchesOrganizationFilter,
  nationalityOptions,
  organizationOptions,
  parseWorkerPaste,
  shiftLabel,
  workerAddWarnings,
  ORGANIZATION_UNSET,
} from '../../lib/workerBulk';
import PageHeader from '../../components/PageHeader';
import ListTruncationNotice from '../../components/ListTruncationNotice';
import MobileListCard, { MobileCardField } from '../../components/MobileListCard';
import WorkerEditModal from '../../components/WorkerEditModal';

const inputClass =
  'rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

function hasEquipmentAssigned(row) {
  return Boolean(row?.default_equipment_id);
}

const IMPORT_STATUS = {
  new: { label: '신규', className: 'bg-goodSoft text-good' },
  restore: { label: '복원 대상', className: 'bg-accentSoft text-accent' },
  duplicate: { label: '중복', className: 'bg-warnSoft text-warn' },
  error: { label: '오류', className: 'bg-dangerSoft text-danger' },
};

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

function UnsetBadge() {
  return (
    <span className="inline-flex rounded-full bg-warnSoft px-2 py-0.5 text-[11px] font-medium text-warn">
      미설정
    </span>
  );
}

function WorkerNameLink({ name, displayName, className = '' }) {
  const label = displayName.trim() || name;
  const month = formatKstISODate(new Date()).slice(0, 7);
  return (
    <Link
      href={attendanceCardPath(name, month)}
      className={`font-medium text-text hover:text-accent hover:underline ${className}`.trim()}
      title="근태 기록 카드"
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
        <div className="flex flex-wrap items-center gap-2">
          <WorkerNameLink name={name} displayName={displayName} />
          {isWorkerSetupIncomplete(row) ? <UnsetBadge /> : null}
        </div>
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
      <td className="px-4 py-3 text-sm text-text">{row?.organization || '미설정'}</td>
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
      header={
        <span className="inline-flex flex-wrap items-center gap-2">
          <WorkerNameLink name={name} displayName={displayName} />
          {isWorkerSetupIncomplete(row) ? <UnsetBadge /> : null}
        </span>
      }
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
      <MobileCardField label="조직">
        <span className={row?.organization ? 'text-sm text-text' : 'text-sm text-muted'}>
          {row?.organization || '미설정'}
        </span>
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
  const { loading, error, truncated, defects, goods, fives, workerDirectory, refetch } = useReports();
  const [saving, setSaving] = useState(null);
  const [formError, setFormError] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [hiddenNames, setHiddenNames] = useState(() => new Set());
  const [showAllWorkers, setShowAllWorkers] = useState(false);
  const [equipmentList, setEquipmentList] = useState([]);
  const [filterUnassigned, setFilterUnassigned] = useState(false);
  const [selectedNames, setSelectedNames] = useState(() => new Set());
  const [bulkEquipmentId, setBulkEquipmentId] = useState('');
  const [bulkShiftChoice, setBulkShiftChoice] = useState('');
  const [bulkOrganization, setBulkOrganization] = useState('');
  const [bulkOrganizationText, setBulkOrganizationText] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    displayName: '',
    nationality: '',
    shift: '',
    process: '',
    organization: '',
    role: 'inspector',
    note: '',
  });
  const [pasteText, setPasteText] = useState('');
  const [importSummary, setImportSummary] = useState(null);
  const [filterUnset, setFilterUnset] = useState(false);
  const [filterOrganization, setFilterOrganization] = useState('');
  const [filterOrganizationUnset, setFilterOrganizationUnset] = useState(false);

  useEffect(() => {
    const name = new URLSearchParams(window.location.search).get('addName');
    if (!name) return;
    setAddForm((prev) => ({ ...prev, name }));
    document.getElementById('worker-add-name')?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const companyId = await getCompanyId();
        const { data, error: eqError } = await supabase
          .from('equipment')
          .select('id, name, line')
          .eq('company_id', companyId)
          .order('name');
        if (cancelled) return;
        if (eqError) {
          setFormError(eqError.message);
          return;
        }
        setEquipmentList(data || []);
      } catch (err) {
        if (!cancelled) setFormError(err?.message || '설비 목록을 불러오지 못했습니다.');
      }
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
    return baseTableNames.filter((name) => {
      const row = directoryMap.get(name);
      if (filterUnassigned && hasEquipmentAssigned(row)) return false;
      if (filterUnset && !isWorkerSetupIncomplete(row)) return false;
      if (filterOrganizationUnset && !matchesOrganizationFilter(row?.organization, ORGANIZATION_UNSET)) {
        return false;
      }
      if (!matchesOrganizationFilter(row?.organization, filterOrganization)) return false;
      return true;
    });
  }, [
    baseTableNames,
    filterUnassigned,
    filterUnset,
    filterOrganization,
    filterOrganizationUnset,
    directoryMap,
  ]);

  const unsetCount = useMemo(
    () => baseTableNames.filter((name) => isWorkerSetupIncomplete(directoryMap.get(name))).length,
    [baseTableNames, directoryMap]
  );

  const nationalityChoices = useMemo(
    () => nationalityOptions(workerDirectory),
    [workerDirectory]
  );

  const processChoices = useMemo(() => {
    const extras = new Set(WORKER_PROCESSES);
    for (const row of workerDirectory) {
      const value = String(row?.process || '').trim();
      if (value) extras.add(value);
    }
    return [...extras];
  }, [workerDirectory]);

  const organizationChoices = useMemo(
    () => organizationOptions(workerDirectory),
    [workerDirectory]
  );

  const addWarnings = useMemo(
    () => workerAddWarnings({ nationality: addForm.nationality, shift: addForm.shift }),
    [addForm.nationality, addForm.shift]
  );

  const importPreview = useMemo(
    () => classifyWorkerImport(parseWorkerPaste(pasteText), workerDirectory),
    [pasteText, workerDirectory]
  );

  const colCount = (showAllWorkers ? 8 : 7) + 3; // checkbox + 담당 설비 + 조직

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

  function workerUpsertPayload(worker_name, existing, patch, companyId) {
    return {
      worker_name,
      company_id: existing?.company_id ?? companyId,
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
      organization: existing?.organization ?? null,
      removed: existing?.removed ?? false,
      default_equipment_id: existing?.default_equipment_id ?? null,
      ...patch,
    };
  }

  async function upsertWorker(worker_name, patch) {
    setSaving(worker_name);
    setFormError(null);
    const existing = directoryMap.get(worker_name);
    try {
      const companyId = await getCompanyId();
      const { error: upsertError } = await supabase
        .from('worker_directory')
        .upsert(workerUpsertPayload(worker_name, existing, patch, companyId));
      setSaving(null);
      if (upsertError) {
        setFormError(upsertError.message);
        return false;
      }
      refetch();
      return true;
    } catch (err) {
      setSaving(null);
      setFormError(err?.message || '저장에 실패했습니다.');
      return false;
    }
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
      const companyId = await getCompanyId();
      for (const worker_name of names) {
        const existing = directoryMap.get(worker_name);
        const { error: upsertError } = await supabase
          .from('worker_directory')
          .upsert(
            workerUpsertPayload(worker_name, existing, {
              default_equipment_id: equipmentId,
            }, companyId)
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

  function patchAddForm(partial) {
    setAddForm((prev) => ({ ...prev, ...partial }));
  }

  async function handleAddWorker() {
    const name = addForm.name.trim();
    if (!name) return;
    const [classified] = classifyWorkerImport(
      [
        {
          name,
          nationality: addForm.nationality,
          shift: addForm.shift || null,
          process: addForm.process,
          organization: addForm.organization,
          error: null,
        },
      ],
      workerDirectory
    );
    if (classified.status === 'duplicate') {
      setFormError(MSG_ALREADY_REGISTERED);
      return;
    }
    if (classified.status === 'restore' && !window.confirm(MSG_RESTORE_CONFIRM)) return;

    setSaving('__new__');
    setFormError(null);
    try {
      const companyId = await getCompanyId();
      if (classified.status === 'restore') {
        const existing = classified.existing;
        const { error: restoreError } = await supabase.from('worker_directory').upsert(
          workerUpsertPayload(
            existing.worker_name,
            existing,
            buildRestorePatch({
              nationality: addForm.nationality,
              shift: addForm.shift || null,
              process: addForm.process,
              organization: addForm.organization,
            }),
            companyId
          )
        );
        setSaving(null);
        if (restoreError) {
          setFormError(restoreError.message);
          return;
        }
      } else {
        const { error: insertError } = await supabase.from('worker_directory').insert(
          buildNewWorkerRow(
            { ...addForm, name, role: normalizeWorkerRole(addForm.role) },
            companyId
          )
        );
        setSaving(null);
        if (insertError) {
          setFormError(insertError.message);
          return;
        }
      }
      setAddForm({
        name: '',
        displayName: '',
        nationality: '',
        shift: '',
        process: '',
        organization: '',
        role: 'inspector',
        note: '',
      });
      refetch();
    } catch (err) {
      setSaving(null);
      setFormError(err?.message || '추가에 실패했습니다.');
    }
  }

  async function handleBulkImport() {
    const fresh = importPreview.filter((row) => row.status === 'new' || row.status === 'restore');
    const skippedDup = importPreview.filter((row) => row.status === 'duplicate').length;
    const skippedErr = importPreview.filter((row) => row.status === 'error').length;
    if (!importPreview.length) return;
    const created = fresh.filter((row) => row.status === 'new').length;
    const restored = fresh.filter((row) => row.status === 'restore').length;
    if (fresh.length) {
      const ok = window.confirm(
        `${fresh.map((row) => row.name).join(', ')}\n신규 ${created}명, 복원 ${restored}명을 등록합니다. 중복 ${skippedDup}명, 오류 ${skippedErr}명은 건너뜁니다.`
      );
      if (!ok) return;
    }

    setBulkSaving(true);
    setFormError(null);
    let doneNew = 0;
    let doneRestore = 0;
    let failed = 0;
    try {
      const companyId = await getCompanyId();
      for (const row of fresh) {
        if (row.status === 'restore') {
          const { error: restoreError } = await supabase.from('worker_directory').upsert(
            workerUpsertPayload(
              row.existing.worker_name,
              row.existing,
              buildRestorePatch(row),
              companyId
            )
          );
          if (restoreError) {
            failed += 1;
            setFormError(restoreError.message);
            continue;
          }
          doneRestore += 1;
        } else {
          const { error: insertError } = await supabase.from('worker_directory').insert(
            buildNewWorkerRow(
              {
                name: row.name,
                nationality: row.nationality,
                shift: row.shift,
                process: row.process,
                organization: row.organization,
                role: 'inspector',
              },
              companyId
            )
          );
          if (insertError) {
            failed += 1;
            setFormError(insertError.message);
            continue;
          }
          doneNew += 1;
        }
      }
      setImportSummary(
        `신규 ${doneNew}명, 복원 ${doneRestore}명 등록. 중복 ${skippedDup}명, 오류 ${skippedErr}명은 건너뛰었습니다.${
          failed ? ` 실패 ${failed}명.` : ''
        }`
      );
      if (doneNew || doneRestore) {
        setPasteText('');
        refetch();
      }
    } catch (err) {
      setFormError(err?.message || '일괄 등록에 실패했습니다.');
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleBulkShift() {
    const names = [...selectedNames].filter(
      (name) => tableNames.includes(name) || baseTableNames.includes(name)
    );
    if (!names.length || !bulkShiftChoice) {
      setFormError('교대를 바꿀 작업자를 선택하세요.');
      return;
    }
    const nextShift = bulkShiftChoice === 'unset' ? null : bulkShiftChoice;
    const ok = window.confirm(
      `${names.join(', ')}\n기본 교대를 ${shiftLabel(nextShift)}으로 변경합니다.`
    );
    if (!ok) return;

    setBulkSaving(true);
    setFormError(null);
    try {
      const companyId = await getCompanyId();
      for (const worker_name of names) {
        const existing = directoryMap.get(worker_name);
        const { error: upsertError } = await supabase.from('worker_directory').upsert(
          workerUpsertPayload(worker_name, existing, { default_shift: nextShift }, companyId)
        );
        if (upsertError) throw new Error(upsertError.message);
      }
      setBulkShiftChoice('');
      refetch();
    } catch (err) {
      setFormError(err?.message || '교대 일괄 변경에 실패했습니다.');
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleBulkOrganization() {
    const names = [...selectedNames].filter(
      (name) => tableNames.includes(name) || baseTableNames.includes(name)
    );
    if (!names.length || (!bulkOrganization && !bulkOrganizationText.trim())) {
      setFormError('조직을 바꿀 작업자를 선택하세요.');
      return;
    }
    const typed = bulkOrganizationText.trim();
    const nextOrganization = typed
      ? typed
      : bulkOrganization === ORGANIZATION_UNSET
        ? null
        : bulkOrganization.trim();
    const ok = window.confirm(
      `${names.join(', ')}\n조직을 ${nextOrganization || '미설정'}으로 변경합니다.`
    );
    if (!ok) return;

    setBulkSaving(true);
    setFormError(null);
    try {
      const companyId = await getCompanyId();
      for (const worker_name of names) {
        const existing = directoryMap.get(worker_name);
        const { error: upsertError } = await supabase.from('worker_directory').upsert(
          workerUpsertPayload(worker_name, existing, { organization: nextOrganization }, companyId)
        );
        if (upsertError) throw new Error(upsertError.message);
      }
      setBulkOrganization('');
      setBulkOrganizationText('');
      refetch();
    } catch (err) {
      setFormError(err?.message || '조직 일괄 변경에 실패했습니다.');
    } finally {
      setBulkSaving(false);
    }
  }

  async function handleRemoveWorker(name) {
    if (!name) return;
    const existing = directoryMap.get(name);
    setSaving(name);
    setFormError(null);
    setEditTarget(null);

    setHiddenNames((prev) => new Set(prev).add(name));

    try {
      const companyId = await getCompanyId();
      const { error: removeError } = await supabase
        .from('worker_directory')
        .upsert(workerUpsertPayload(name, existing, { removed: true }, companyId));
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
    } catch (err) {
      setSaving(null);
      setHiddenNames((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      setFormError(err?.message || '삭제에 실패했습니다.');
    }
  }

  const emptyListLabel =
    filterUnset && filterUnassigned
      ? '조건에 맞는 작업자가 없습니다'
      : filterUnset
        ? '국적·교대 미설정 작업자가 없습니다'
        : filterUnassigned
          ? '설비 미지정 작업자가 없습니다'
          : '등록된 작업자가 없습니다';
  const showAddWarnings = Boolean(
    addForm.name.trim() ||
      addForm.nationality.trim() ||
      addForm.shift ||
      addForm.process.trim() ||
      addForm.organization.trim() ||
      addForm.displayName.trim() ||
      addForm.note.trim()
  );

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
        {truncated ? <ListTruncationNotice show /> : null}
        {unassignedCount > 0 ? (
          <div className="rounded-xl border border-warn/30 bg-warnSoft px-4 py-3 text-sm text-text">
            담당 설비 미지정 {unassignedCount}명 — 이 작업자들의 불량 기록에는 설비 정보가
            남지 않습니다
          </div>
        ) : null}

        <form
          className="space-y-3 rounded-xl border border-border bg-surface px-4 py-4 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            handleAddWorker();
          }}
        >
          <div className="text-sm font-medium text-text">작업자 추가</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block text-xs text-muted">
              이름
              <input
                id="worker-add-name"
                type="text"
                required
                value={addForm.name}
                onChange={(e) => patchAddForm({ name: e.target.value })}
                placeholder="예: 홍길동"
                className={`${inputClass} mt-1.5 w-full`}
              />
            </label>
            <label className="block text-xs text-muted">
              표시명
              <input
                type="text"
                value={addForm.displayName}
                onChange={(e) => patchAddForm({ displayName: e.target.value })}
                className={`${inputClass} mt-1.5 w-full`}
              />
            </label>
            <label className="block text-xs text-muted">
              국적
              <input
                type="text"
                list="worker-nationality-options"
                value={addForm.nationality}
                onChange={(e) => patchAddForm({ nationality: e.target.value })}
                placeholder="선택 또는 직접 입력"
                className={`${inputClass} mt-1.5 w-full`}
              />
              <datalist id="worker-nationality-options">
                {nationalityChoices.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </label>
            <label className="block text-xs text-muted">
              기본 교대
              <select
                value={addForm.shift}
                onChange={(e) => patchAddForm({ shift: e.target.value })}
                className={`${inputClass} mt-1.5 w-full`}
              >
                <option value="">미지정</option>
                <option value="day">주간</option>
                <option value="night">야간</option>
              </select>
            </label>
            <label className="block text-xs text-muted">
              공정
              <input
                type="text"
                list="worker-process-options"
                value={addForm.process}
                onChange={(e) => patchAddForm({ process: e.target.value })}
                placeholder="선택 또는 직접 입력"
                className={`${inputClass} mt-1.5 w-full`}
              />
              <datalist id="worker-process-options">
                {processChoices.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </label>
            <label className="block text-xs text-muted">
              조직
              <input
                type="text"
                list="worker-organization-options"
                value={addForm.organization}
                onChange={(e) => patchAddForm({ organization: e.target.value })}
                placeholder="선택 또는 직접 입력, 비우면 미설정"
                className={`${inputClass} mt-1.5 w-full`}
              />
              <datalist id="worker-organization-options">
                {organizationChoices.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </label>
            <label className="block text-xs text-muted">
              역할
              <select
                value={addForm.role}
                onChange={(e) => patchAddForm({ role: e.target.value })}
                className={`${inputClass} mt-1.5 w-full`}
              >
                {WORKER_ROLES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted sm:col-span-2">
              메모
              <input
                type="text"
                value={addForm.note}
                onChange={(e) => patchAddForm({ note: e.target.value })}
                className={`${inputClass} mt-1.5 w-full`}
              />
            </label>
          </div>
          {showAddWarnings
            ? addWarnings.map((warning) => (
                <p key={warning} className="text-xs text-warn">
                  {warning}
                </p>
              ))
            : null}
          <button
            type="submit"
            disabled={!addForm.name.trim() || saving === '__new__'}
            className="min-h-[44px] rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
          >
            {saving === '__new__' ? '추가 중...' : '추가'}
          </button>
        </form>

        <div className="space-y-3 rounded-xl border border-border bg-surface px-4 py-4 shadow-card">
          <div className="text-sm font-medium text-text">일괄 등록</div>
          <p className="text-xs text-muted">
            한 줄에 이름, 국적, 교대, 공정, 조직. 탭 또는 쉼표로 구분하고 뒤 항목은 생략할 수 있습니다.
            교대는 주간/야간/day/night/주/야. 조직이 없는 기존 4열도 그대로 등록됩니다.
          </p>
          <textarea
            value={pasteText}
            onChange={(e) => {
              setPasteText(e.target.value);
              setImportSummary(null);
            }}
            rows={5}
            placeholder={'홍길동,베트남,야간,주조,1공장\n김철수\t한국\t주'}
            className={`${inputClass} w-full font-mono`}
          />
          {importPreview.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-2 py-2">이름</th>
                    <th className="px-2 py-2">국적</th>
                    <th className="px-2 py-2">교대</th>
                    <th className="px-2 py-2">공정</th>
                    <th className="px-2 py-2">조직</th>
                    <th className="px-2 py-2">결과</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((row, index) => {
                    const status = IMPORT_STATUS[row.status] || IMPORT_STATUS.error;
                    return (
                      <tr key={`${row.name}-${index}`} className="border-b border-border last:border-0">
                        <td className="px-2 py-2">{row.name || '—'}</td>
                        <td className="px-2 py-2">{row.nationality || '—'}</td>
                        <td className="px-2 py-2">{row.shift ? shiftLabel(row.shift) : '—'}</td>
                        <td className="px-2 py-2">{row.process || '—'}</td>
                        <td className="px-2 py-2">{row.organization || '—'}</td>
                        <td className="px-2 py-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${status.className}`}>
                            {status.label}
                          </span>
                          {row.message && row.status !== 'new' ? (
                            <span className="ml-2 text-xs text-muted">{row.message}</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          <button
            type="button"
            onClick={handleBulkImport}
            disabled={!importPreview.length || bulkSaving}
            className="min-h-[44px] rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
          >
            {bulkSaving ? '등록 중...' : '확인 후 등록'}
          </button>
          {importSummary ? <p className="text-xs text-text">{importSummary}</p> : null}
        </div>

        <div className="flex flex-wrap items-end gap-3">
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
          <button
            type="button"
            onClick={() => setFilterUnset((prev) => !prev)}
            className={`min-h-[44px] rounded-full border px-3 py-1.5 text-sm font-medium transition-colors md:min-h-0 ${
              filterUnset
                ? 'border-warn/40 bg-warnSoft text-text'
                : 'border-border bg-surface text-muted hover:bg-surface2 hover:text-text'
            }`}
          >
            미설정만 보기{unsetCount > 0 ? ` · ${unsetCount}` : ''}
          </button>
          <label className="block text-xs text-muted">
            조직
            <select
              value={filterOrganization}
              onChange={(e) => setFilterOrganization(e.target.value)}
              className={`${inputClass} mt-1.5 min-w-[8rem]`}
            >
              <option value="">전체</option>
              {organizationChoices.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
              <option value={ORGANIZATION_UNSET}>미설정</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setFilterOrganizationUnset((prev) => !prev)}
            className={`min-h-[44px] rounded-full border px-3 py-1.5 text-sm font-medium transition-colors md:min-h-0 ${
              filterOrganizationUnset
                ? 'border-warn/40 bg-warnSoft text-text'
                : 'border-border bg-surface text-muted hover:bg-surface2 hover:text-text'
            }`}
          >
            조직 미설정만 보기
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface2/40 px-4 py-3">
          <div className="text-xs text-muted">선택 {selectedNames.size}명</div>
          <label className="block text-xs text-muted">
            담당 설비
            <select
              value={bulkEquipmentId}
              disabled={bulkSaving || selectedNames.size === 0}
              onChange={(e) => setBulkEquipmentId(e.target.value)}
              className={`${inputClass} mt-1.5 min-w-[10rem]`}
            >
            <option value="">미지정으로</option>
            {equipmentList.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name}
                {eq.line ? ` (${eq.line})` : ''}
              </option>
            ))}
          </select>
          </label>
          <button
            type="button"
            onClick={handleBulkAssign}
            disabled={bulkSaving || selectedNames.size === 0}
            className="min-h-[44px] rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
          >
            {bulkSaving ? '적용 중...' : '설비 적용'}
          </button>
          <label className="block text-xs text-muted">
            기본 교대 변경
            <select
              value={bulkShiftChoice}
              disabled={bulkSaving || selectedNames.size === 0}
              onChange={(e) => setBulkShiftChoice(e.target.value)}
              className={`${inputClass} mt-1.5 min-w-[8rem]`}
            >
              <option value="">교대 선택</option>
              <option value="day">주간</option>
              <option value="night">야간</option>
              <option value="unset">미지정</option>
            </select>
          </label>
          <button
            type="button"
            onClick={handleBulkShift}
            disabled={bulkSaving || selectedNames.size === 0 || !bulkShiftChoice}
            className="min-h-[44px] rounded-xl border border-accent bg-surface px-4 py-2 text-sm font-medium text-accent transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
          >
            교대 변경
          </button>
          <label className="block text-xs text-muted">
            조직 변경
            <input
              type="text"
              list="worker-organization-bulk"
              value={bulkOrganizationText}
              disabled={bulkSaving || selectedNames.size === 0}
              placeholder="직접 입력"
              onChange={(e) => setBulkOrganizationText(e.target.value)}
              className={`${inputClass} mt-1.5 min-w-[8rem]`}
            />
            <datalist id="worker-organization-bulk">
              {organizationChoices.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </label>
          <label className="block text-xs text-muted">
            또는 선택
            <select
              value={bulkOrganization}
              disabled={bulkSaving || selectedNames.size === 0}
              onChange={(e) => setBulkOrganization(e.target.value)}
              className={`${inputClass} mt-1.5 min-w-[8rem]`}
            >
              <option value="">조직 선택</option>
              {organizationChoices.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
              <option value={ORGANIZATION_UNSET}>미설정</option>
            </select>
          </label>
          <button
            type="button"
            onClick={handleBulkOrganization}
            disabled={
              bulkSaving ||
              selectedNames.size === 0 ||
              (!bulkOrganization && !bulkOrganizationText.trim())
            }
            className="min-h-[44px] rounded-xl border border-accent bg-surface px-4 py-2 text-sm font-medium text-accent transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0"
          >
            조직 변경
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
              {emptyListLabel}
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
                <th className="px-4 py-3">조직</th>
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
                    {emptyListLabel}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted">
          제외된 작업자는 작업자 현황, 자주검사, 대시보드 등 집계 화면에서 표시되지 않습니다.
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
          organizationOptions={organizationChoices}
          saving={saving === editTarget}
          onSave={upsertWorker}
          onRequestDelete={handleRemoveWorker}
          onClose={() => setEditTarget(null)}
        />
      ) : null}
    </div>
  );
}
