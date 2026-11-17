'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import { WORKER_PROCESSES } from '../../lib/constants';
import { kindLabel } from '../../lib/inspection/adminAccess';
import {
  createInspectionItem,
  fetchInspectionItems,
  patchInspectionItem,
} from '../../lib/inspection/clientApi';

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';
const selectClass =
  'rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';
const btnClass =
  'min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm text-muted hover:bg-surface2 hover:text-text disabled:opacity-50 md:min-h-0';
const primaryBtn =
  'min-h-[44px] rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 md:min-h-0';

const EMPTY_FORM = {
  process: '주조',
  kind: 'equipment_check',
  item_no: '',
  title: '',
  detail: '',
  cycle: '',
  method: '',
  unit: '',
  sort_order: '',
  is_active: true,
};

function toForm(row) {
  return {
    process: row.process || '주조',
    kind: row.kind || 'equipment_check',
    item_no: row.item_no ?? '',
    title: row.title || '',
    detail: row.detail || '',
    cycle: row.cycle || '',
    method: row.method || '',
    unit: row.unit || '',
    sort_order: row.sort_order ?? '',
    is_active: row.is_active !== false,
  };
}

function ItemModal({ open, title, form, setForm, error, saving, onClose, onSave }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface shadow-xl">
        <div className="border-b border-border px-5 py-4">
          <div className="text-base font-semibold text-text">{title}</div>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block text-xs text-muted">
            공정
            <select
              className={`${selectClass} mt-1 w-full`}
              value={form.process}
              onChange={(e) => setForm((prev) => ({ ...prev, process: e.target.value }))}
            >
              {WORKER_PROCESSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            종류
            <select
              className={`${selectClass} mt-1 w-full`}
              value={form.kind}
              onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value }))}
            >
              <option value="equipment_check">설비일상점검</option>
              <option value="production_condition">생산조건</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-muted">
              항목 번호
              <input
                type="number"
                min={1}
                className={`${inputClass} mt-1`}
                value={form.item_no}
                onChange={(e) => setForm((prev) => ({ ...prev, item_no: e.target.value }))}
              />
            </label>
            <label className="block text-xs text-muted">
              정렬 순서
              <input
                type="number"
                className={`${inputClass} mt-1`}
                value={form.sort_order}
                onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))}
                placeholder="비우면 항목 번호"
              />
            </label>
          </div>
          <label className="block text-xs text-muted">
            항목명
            <input
              className={`${inputClass} mt-1`}
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            />
          </label>
          <label className="block text-xs text-muted">
            세부
            <textarea
              className={`${inputClass} mt-1 min-h-[72px]`}
              value={form.detail}
              onChange={(e) => setForm((prev) => ({ ...prev, detail: e.target.value }))}
            />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-xs text-muted">
              주기
              <input
                className={`${inputClass} mt-1`}
                value={form.cycle}
                onChange={(e) => setForm((prev) => ({ ...prev, cycle: e.target.value }))}
              />
            </label>
            <label className="block text-xs text-muted">
              방법
              <input
                className={`${inputClass} mt-1`}
                value={form.method}
                onChange={(e) => setForm((prev) => ({ ...prev, method: e.target.value }))}
              />
            </label>
            <label className="block text-xs text-muted">
              단위
              <input
                className={`${inputClass} mt-1`}
                value={form.unit}
                onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
            />
            사용 중
          </label>
          {error ? (
            <div className="rounded-xl border border-danger/30 bg-dangerSoft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
          <button type="button" className={btnClass} onClick={onClose} disabled={saving}>
            취소
          </button>
          <button type="button" className={primaryBtn} onClick={onSave} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InspectionItemsPage() {
  const [process, setProcess] = useState('주조');
  const [kind, setKind] = useState('equipment_check');
  const [includeInactive, setIncludeInactive] = useState(true);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const data = await fetchInspectionItems({
        process,
        kind,
        includeInactive: includeInactive ? '1' : '',
      });
      setRows(data.rows || []);
    } catch (err) {
      setRows([]);
      setListError(err?.message || '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [process, kind, includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (so !== 0) return so;
        return (a.item_no ?? 0) - (b.item_no ?? 0);
      }),
    [rows]
  );

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, process, kind });
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(row) {
    setEditingId(row.id);
    setForm(toForm(row));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setFormError(null);
  }

  async function saveModal() {
    setSaving(true);
    setFormError(null);
    const payload = {
      process: form.process,
      kind: form.kind,
      item_no: form.item_no === '' ? undefined : Number(form.item_no),
      title: form.title,
      detail: form.detail || null,
      cycle: form.cycle || null,
      method: form.method || null,
      unit: form.unit || null,
      sort_order: form.sort_order === '' ? undefined : Number(form.sort_order),
      is_active: form.is_active,
    };
    try {
      if (editingId) {
        await patchInspectionItem({ id: editingId, patch: payload });
      } else {
        await createInspectionItem(payload);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err?.message || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function moveSort(row, direction) {
    const index = sorted.findIndex((r) => r.id === row.id);
    const swapWith = sorted[index + direction];
    if (!swapWith) return;
    setListError(null);
    try {
      await patchInspectionItem({
        id: row.id,
        patch: { sort_order: swapWith.sort_order },
      });
      await patchInspectionItem({
        id: swapWith.id,
        patch: { sort_order: row.sort_order },
      });
      await load();
    } catch (err) {
      setListError(err?.message || '순서 변경에 실패했습니다.');
    }
  }

  async function toggleActive(row) {
    setListError(null);
    try {
      await patchInspectionItem({
        id: row.id,
        patch: { is_active: !row.is_active },
      });
      await load();
    } catch (err) {
      setListError(err?.message || '상태 변경에 실패했습니다.');
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        eyebrow="설정"
        title="점검 항목 마스터"
        description="설비일상점검·생산조건 항목을 공정·종류별로 관리합니다. 삭제는 사용 중지로 처리합니다."
        actions={
          <button type="button" className={primaryBtn} onClick={openCreate}>
            항목 추가
          </button>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            공정
            <select
              className={selectClass}
              value={process}
              onChange={(e) => setProcess(e.target.value)}
            >
              {WORKER_PROCESSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            종류
            <select
              className={selectClass}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="equipment_check">설비일상점검</option>
              <option value="production_condition">생산조건</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            사용 중지 포함
          </label>
        </div>

        {listError ? (
          <div className="rounded-xl border border-danger/30 bg-dangerSoft px-3 py-2 text-sm text-danger">
            {listError}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-surface2 text-xs text-muted">
              <tr>
                <th className="px-3 py-3 font-medium">순서</th>
                <th className="px-3 py-3 font-medium">번호</th>
                <th className="px-3 py-3 font-medium">항목명</th>
                <th className="px-3 py-3 font-medium">세부</th>
                <th className="px-3 py-3 font-medium">주기/방법/단위</th>
                <th className="px-3 py-3 font-medium">상태</th>
                <th className="px-3 py-3 font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    불러오는 중…
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    {process} · {kindLabel(kind)} 항목이 없습니다.
                  </td>
                </tr>
              ) : (
                sorted.map((row, index) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className={btnClass}
                          disabled={index === 0}
                          onClick={() => moveSort(row, -1)}
                          title="위로"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className={btnClass}
                          disabled={index === sorted.length - 1}
                          onClick={() => moveSort(row, 1)}
                          title="아래로"
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-text">{row.item_no}</td>
                    <td className="px-3 py-3 font-medium text-text">{row.title}</td>
                    <td className="max-w-[240px] px-3 py-3 text-muted">
                      <span className="line-clamp-2">{row.detail || '—'}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">
                      {[row.cycle, row.method, row.unit].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-3 py-3">
                      {row.is_active ? (
                        <span className="rounded-full bg-goodSoft px-2 py-0.5 text-xs text-good">
                          사용
                        </span>
                      ) : (
                        <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs text-muted">
                          중지
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button type="button" className={btnClass} onClick={() => openEdit(row)}>
                          수정
                        </button>
                        <button type="button" className={btnClass} onClick={() => toggleActive(row)}>
                          {row.is_active ? '사용 중지' : '재사용'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ItemModal
        open={modalOpen}
        title={editingId ? '항목 수정' : '항목 추가'}
        form={form}
        setForm={setForm}
        error={formError}
        saving={saving}
        onClose={closeModal}
        onSave={saveModal}
      />
    </div>
  );
}
