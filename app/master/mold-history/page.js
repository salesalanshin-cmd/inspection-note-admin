'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import { getDisplayName } from '../../../lib/analytics';
import { getCompanyId } from '../../../lib/company';
import { getRecentDaysRange } from '../../../lib/dateRange';
import { moldLabel } from '../../../lib/equipmentMold';
import { kstWallToUtc } from '../../../lib/kst';
import PageHeader from '../../../components/PageHeader';
import DateRangePicker from '../../../components/DateRangePicker';

const inputClass =
  'rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none';

function parseYmd(ymd) {
  const [y, m, d] = String(ymd || '')
    .split('-')
    .map((n) => Number(n));
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}

function formatDateTime(iso) {
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

function moldNameFromMap(id, moldMap) {
  if (!id) return '—';
  return moldLabel(moldMap.get(id)) || id.slice(0, 8);
}

export default function MoldHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [molds, setMolds] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [rows, setRows] = useState([]);
  const [equipmentId, setEquipmentId] = useState('');
  const [dateRange, setDateRange] = useState(() => getRecentDaysRange(30));

  const moldMap = useMemo(() => {
    const map = new Map();
    for (const m of molds) map.set(m.id, m);
    return map;
  }, [molds]);

  const equipmentMap = useMemo(() => {
    const map = new Map();
    for (const e of equipment) map.set(e.id, e);
    return map;
  }, [equipment]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const startParts = parseYmd(dateRange.start);
      const endParts = parseYmd(dateRange.end);
      if (!startParts || !endParts) throw new Error('기간이 올바르지 않습니다.');

      const startIso = kstWallToUtc(
        startParts.year,
        startParts.month,
        startParts.day,
        0,
        0,
        0
      ).toISOString();
      const endExclusive = kstWallToUtc(
        endParts.year,
        endParts.month,
        endParts.day,
        0,
        0,
        0
      );
      endExclusive.setTime(endExclusive.getTime() + 24 * 60 * 60 * 1000);
      const endIso = endExclusive.toISOString();

      let query = supabase
        .from('mold_change_log')
        .select(
          'id, equipment_id, from_mold_id, to_mold_id, changed_by, source, note, changed_at'
        )
        .gte('changed_at', startIso)
        .lt('changed_at', endIso)
        .order('changed_at', { ascending: false });

      if (equipmentId) query = query.eq('equipment_id', equipmentId);

      const companyId = await getCompanyId();
      const [logRes, eqRes, moldRes, dirRes] = await Promise.all([
        query,
        supabase
          .from('equipment')
          .select('id, name, line')
          .eq('company_id', companyId)
          .order('name'),
        supabase
          .from('product_mold')
          .select('id, product_name, mold_code')
          .eq('company_id', companyId),
        supabase
          .from('worker_directory')
          .select('worker_name, display_name')
          .eq('company_id', companyId),
      ]);

      if (logRes.error) throw new Error(logRes.error.message);
      if (eqRes.error) throw new Error(eqRes.error.message);
      if (moldRes.error) throw new Error(moldRes.error.message);
      if (dirRes.error) throw new Error(dirRes.error.message);

      setRows(logRes.data || []);
      setEquipment(eqRes.data || []);
      setMolds(moldRes.data || []);
      setWorkers(dirRes.data || []);
    } catch (err) {
      setError(err?.message || '불러오기에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, equipmentId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        eyebrow="MASTER"
        title="금형 교체 이력"
        description="설비별 금형 교체 로그(mold_change_log). AI 추정 학습용 정답 데이터입니다."
      />

      <div className="space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-end gap-3">
          <Link
            href="/master?tab=equipment"
            className="min-h-[44px] rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-accent hover:bg-surface2 md:min-h-0"
          >
            ← 설비 목록
          </Link>
          <label className="block space-y-1">
            <span className="text-xs text-muted">설비</span>
            <select
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              className={`${inputClass} min-w-[12rem]`}
            >
              <option value="">전체</option>
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                  {eq.line ? ` (${eq.line})` : ''}
                </option>
              ))}
            </select>
          </label>
          <div>
            <div className="mb-1 text-xs text-muted">기간</div>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        {error ? (
          <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">{error}</div>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted">불러오는 중...</p>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-surface shadow-card">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface2 text-left text-xs font-medium text-muted">
                  <th className="px-4 py-3">시각</th>
                  <th className="px-4 py-3">설비</th>
                  <th className="px-4 py-3">이전 금형</th>
                  <th className="px-4 py-3">변경 금형</th>
                  <th className="px-4 py-3">출처</th>
                  <th className="px-4 py-3">등록자</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 whitespace-nowrap text-muted">
                      {formatDateTime(row.changed_at)}
                    </td>
                    <td className="px-4 py-2">
                      {equipmentMap.get(row.equipment_id)?.name || row.equipment_id}
                    </td>
                    <td className="px-4 py-2 text-muted">
                      {moldNameFromMap(row.from_mold_id, moldMap)}
                    </td>
                    <td className="px-4 py-2">
                      {moldNameFromMap(row.to_mold_id, moldMap)}
                    </td>
                    <td className="px-4 py-2 text-muted">{row.source || '—'}</td>
                    <td className="px-4 py-2 text-muted">
                      {row.changed_by
                        ? getDisplayName(row.changed_by, workers)
                        : '—'}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-xs text-muted">
                      이력이 없습니다
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
