'use client';

import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import InspectionRoundDetail from '../../components/InspectionRoundDetail';
import { LotInspectionLookup } from '../../components/LotInspectionRounds';
import useFilteredQueryFeedback from '../../hooks/useFilteredQueryFeedback';
import { notifyAction } from '../../lib/actionFeedback';
import { getWorkDateForRecord } from '../../lib/analytics';
import { fetchInspectionHeaders } from '../../lib/inspection/clientApi';
import { kindLabel } from '../../lib/inspection/adminAccess';
import { inspectionTime, roundLabels } from '../../lib/inspection/rounds';

const button = 'rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-text hover:bg-surface2 disabled:opacity-50';

export default function EquipmentChecksPage() {
  const queryFeedback = useFilteredQueryFeedback('점검 목록');
  const [date, setDate] = useState(() => getWorkDateForRecord(new Date()));
  const [kind, setKind] = useState('equipment_check');
  const [result, setResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [revision, setRevision] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [showLots, setShowLots] = useState(false);

  useEffect(() => {
    let active = true;
    const finish = queryFeedback.begin();
    setResult(null);
    fetchInspectionHeaders({date, kind}).then(data => {
      if (active) { setResult(data); finish(); }
    }).catch(error => {
      if (active) { setResult({ error: error.message }); finish(false); }
    });
    return () => { active = false; };
  }, [date,kind,revision,queryFeedback]);

  const { groups, numbers } = useMemo(() => {
    const byEquipment = new Map(), roundNos = new Set();
    for (const row of result?.rows || []) {
      if (!byEquipment.has(row.equipment_code)) byEquipment.set(row.equipment_code, new Map());
      byEquipment.get(row.equipment_code).set(row.round_no, row);
      roundNos.add(row.round_no);
    }
    return { groups: [...byEquipment], numbers: [...roundNos].sort((a,b) => a-b) };
  }, [result]);

  function changeFilter(update) {
    queryFeedback.mark(); setSelectedId(null); update();
  }

  async function download() {
    if (!result?.rows?.length || exporting) return;
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const data = result.rows.map(row => ({
        근무일: row.work_date, 구분: kindLabel(row.kind), 설비코드: row.equipment_code,
        설비명: row.equipment_name || '', 회차: row.round_no, 상태: roundLabels[row.round_status],
        촬영수: row.active_count, 항목수: row.required_count, 시작시각: inspectionTime(row.created_at),
        확정시각: inspectionTime(row.confirmed_at), 최초작업자: row.worker_name || '',
        확정자: row.confirmed_by || '', 품번: row.part_no || '', LOT: row.lot_no || '',
      }));
      const sheet = XLSX.utils.json_to_sheet(data);
      sheet['!cols'] = [12,18,14,18,8,10,9,9,21,21,16,16,18,20].map(wch => ({wch}));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook,sheet,'점검 회차');
      XLSX.writeFile(workbook, kindLabel(kind) + '_' + date + '.xlsx');
      notifyAction('점검 회차를 엑셀로 다운로드했습니다.');
    } catch (e) { notifyAction(e.message || '엑셀을 생성하지 못했습니다.', 'error'); }
    finally { setExporting(false); }
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <PageHeader eyebrow="일상" title="설비·생산조건 점검" description="설비별 회차를 선택해 사진과 촬영자, 확정 시각을 확인합니다." />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 md:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">근무일
          <input type="date" value={date} className={button} onChange={e => {
            if (e.target.value) changeFilter(() => setDate(e.target.value));
          }} /></label>
        <div className="flex gap-1 rounded-2xl border border-border bg-surface p-1">
          {['equipment_check','production_condition'].map(value => <button key={value} type="button"
            aria-pressed={kind === value} className={'rounded-xl px-3 py-2 text-sm ' + (kind === value ? 'bg-accentSoft font-semibold text-accent' : 'text-muted hover:bg-surface2')}
            onClick={() => { if (kind !== value) changeFilter(() => setKind(value)); }}>{kindLabel(value)}</button>)}
        </div>
        <button type="button" className={button} onClick={download} disabled={!result?.rows?.length || exporting}>엑셀 다운로드</button>
        <button type="button" className={button} aria-expanded={showLots} onClick={() => setShowLots(v => !v)}>LOT 상세 조회</button>
      </div>
      {showLots && <LotInspectionLookup/>}
      {!result ? <p className="text-muted">점검 회차를 불러오는 중…</p>
        : result.error ? <p className="text-danger" role="alert">{result.error}</p>
        : !groups.length ? <p className="rounded-xl border border-border bg-surface p-4 text-muted">{kindLabel(kind)} 등록이 없습니다.</p>
        : <div className="shrink-0 overflow-x-auto rounded-2xl border border-border bg-surface" tabIndex={0}>
          <table aria-label={kindLabel(kind) + ' 설비별 회차'} className="w-full border-separate border-spacing-0 text-left">
            <thead className="bg-surface2 text-muted"><tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface2 px-4 py-3">설비</th>
              {numbers.map(n => <th scope="col" key={n} className="min-w-32 whitespace-nowrap px-3 py-3">{n}회차</th>)}
            </tr></thead>
            <tbody>{groups.map(([eq, rounds]) => {
              const first = rounds.values().next().value;
              return <tr key={eq}>
                <th scope="row" className="sticky left-0 z-10 min-w-28 border-t border-border bg-surface px-4 py-3">
                  {first.equipment_name || eq}{first.equipment_name && <p className="text-xs font-normal text-muted">{eq}</p>}</th>
                {numbers.map(n => {
                  const row = rounds.get(n);
                  return <td key={n} className="border-t border-border px-3 py-2">
                    {row ? <button type="button" aria-expanded={row.id === selectedId}
                      className={'w-full rounded-lg p-2 text-left ' + (row.id === selectedId ? 'bg-accentSoft text-accent' : 'hover:bg-surface2')}
                      onClick={() => { setSelectedId(row.id); }}>
                      <span className="block whitespace-nowrap font-semibold">{inspectionTime(row.created_at).slice(-5)} · {row.progress_label}</span>
                      <span className={'text-sm ' + (row.round_status === 'cancelled' ? 'text-danger' : 'text-muted')}>{roundLabels[row.round_status]}</span>
                    </button> : '—'}</td>;
                })}
              </tr>;
            })}</tbody>
          </table>
        </div>}
      {selectedId && <InspectionRoundDetail key={selectedId} id={selectedId} editable onClose={() => setSelectedId(null)} onChange={() => setRevision(v => v + 1)} />}
    </div>
  </div>;
}
