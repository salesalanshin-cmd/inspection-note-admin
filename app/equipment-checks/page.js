'use client';

import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import SignedImage from '../../components/SignedImage';
import records from '../../components/RecordTable.module.css';
import { getWorkDateForRecord } from '../../lib/analytics';
import {
  fetchInspectionHeaderDetail,
  fetchInspectionHeaders,
} from '../../lib/inspection/clientApi';
import { kindLabel } from '../../lib/inspection/adminAccess';

const selectClass =
  'rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';
const tabClass = (active) =>
  `rounded-xl px-3 py-2 text-sm transition-colors ${
    active
      ? 'bg-accentSoft font-medium text-accent'
      : 'text-muted hover:bg-surface2 hover:text-text'
  }`;

function formatCapturedAt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

const KINDS = [
  { value: 'equipment_check', label: '설비일상점검' },
  { value: 'production_condition', label: '생산조건' },
];

export default function EquipmentChecksPage() {
  const [date, setDate] = useState(() => getWorkDateForRecord(new Date()));
  const [kind, setKind] = useState('equipment_check');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInspectionHeaders({ date, kind });
      setRows(data.rows || []);
      if (data.date && data.date !== date) setDate(data.date);
    } catch (err) {
      setRows([]);
      setError(err?.message || '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [date, kind]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
  }, [date, kind]);

  async function openDetail(id) {
    setSelectedId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const data = await fetchInspectionHeaderDetail(id);
      setDetail(data);
    } catch (err) {
      setDetailError(err?.message || '상세를 불러오지 못했습니다.');
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        eyebrow="일상"
        title="설비·생산조건 점검"
        description="근무일·종류별 설비 점검 등록 현황과 항목별 사진을 확인합니다."
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            근무일
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={selectClass}
            />
          </label>
          <div className="flex flex-wrap gap-1 rounded-2xl border border-border bg-surface p-1">
            {KINDS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className={tabClass(kind === tab.value)}
                onClick={() => setKind(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-danger/30 bg-dangerSoft px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div className={`${records.region} shrink-0 overflow-x-auto rounded-2xl border border-border bg-surface`}>
          <table aria-label={`${kindLabel(kind)} 등록 현황`} className={`${records.table} w-full text-left text-sm`}>
            <thead className="border-b border-border bg-surface2 text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">설비</th>
                <th className="px-4 py-3 font-medium">진행</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">완료 시각</th>
                <th className="px-4 py-3 font-medium">작업자</th>
                {kind === 'production_condition' ? (
                  <th className="px-4 py-3 font-medium">품번</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    불러오는 중…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    {kindLabel(kind)} 등록이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`cursor-pointer border-t border-border transition-colors hover:bg-surface2 ${
                      selectedId === row.id ? 'bg-accentSoft/40' : ''
                    }`}
                    onClick={() => openDetail(row.id)}
                  >
                    <td data-wide="" className="px-4 py-3">
                      <button type="button" className="text-left text-base font-semibold text-text hover:text-accent" aria-expanded={selectedId === row.id}>
                        {row.equipment_name || row.equipment_code || '—'}
                      </button>
                      {row.equipment_name ? (
                        <div className="text-xs text-muted">{row.equipment_code}</div>
                      ) : null}
                    </td>
                    <td data-label="진행" className="px-4 py-3 text-text">{row.progress_label}</td>
                    <td data-label="상태" className="px-4 py-3">
                      {row.is_completed ? (
                        <span className="rounded-full bg-goodSoft px-2 py-0.5 text-xs font-medium text-good">
                          완료
                        </span>
                      ) : (
                        <span className="rounded-full bg-warnSoft px-2 py-0.5 text-xs font-medium text-warn">
                          미완료
                        </span>
                      )}
                    </td>
                    <td data-label="완료 시각" className="px-4 py-3 text-muted">
                      {formatCapturedAt(row.completed_at)}
                    </td>
                    <td data-label="작업자" className="px-4 py-3 text-text">{row.worker_name || '—'}</td>
                    {kind === 'production_condition' ? (
                      <td data-label="품번" data-wide="" className="px-4 py-3 text-muted">{row.part_no || '—'}</td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedId ? (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-text">항목별 사진</div>
                {detail?.header ? (
                  <div className="mt-1 text-xs text-muted">
                    {detail.header.equipment_name || detail.header.equipment_code} ·{' '}
                    {detail.header.progress_label}
                    {detail.header.is_completed ? ' · 완료' : ' · 미완료'}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface2"
                onClick={() => {
                  setSelectedId(null);
                  setDetail(null);
                  setDetailError(null);
                }}
              >
                닫기
              </button>
            </div>

            {detailLoading ? (
              <div className="py-8 text-center text-sm text-muted">불러오는 중…</div>
            ) : detailError ? (
              <div className="rounded-xl border border-danger/30 bg-dangerSoft px-3 py-2 text-sm text-danger">
                {detailError}
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,9rem),1fr))] gap-3">
                {(detail?.items || []).map((item) => (
                  <div
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-border bg-surface2"
                  >
                    <div className="relative aspect-square bg-border/40">
                      {item.active_photo?.photo_url ? (
                        <SignedImage
                          url={item.active_photo.photo_url}
                          alt={item.title}
                          bucket="defect-images"
                          size="thumbnail"
                          sizes="160px"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-muted">
                          사진 없음
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 p-2">
                      <div className="text-xs font-medium text-text">
                        {item.item_no}. {item.title}
                      </div>
                      <div className="text-xs text-muted">
                        {formatCapturedAt(item.active_photo?.captured_at)}
                      </div>
                      <div className="text-xs text-muted">
                        교체 {item.replaced_count || 0}건
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
