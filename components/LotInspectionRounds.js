'use client';

import { useEffect, useState } from 'react';
import { fetchInspectionHeaders } from '../lib/inspection/clientApi';
import InspectionRoundDetail from './InspectionRoundDetail';
import { inspectionTime } from '../lib/inspection/rounds';
import { notifyAction } from '../lib/actionFeedback';

export function LotInspectionLookup() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState(null);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!search) return;
    const abort = new AbortController();
    setResult(null);
    (async () => {
      const response = await fetch('/api/production-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ action: 'lots', lotId: search.lotId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'MES LOT 조회에 실패했습니다.');
      if (!abort.signal.aborted) { setResult(data); notifyAction('MES LOT를 조회했습니다.'); }
    })().catch(e => { if (!abort.signal.aborted) setResult({ error: e.message }); });
    return () => abort.abort();
  }, [search]);
  return <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
    <form className="flex flex-wrap items-end gap-2" onSubmit={e => {
      e.preventDefault(); const lotId=input.trim().toUpperCase(); if (lotId) setSearch({lotId});
    }}>
      <label className="grid gap-1 text-sm font-medium">생산 LOT 번호
        <input autoCapitalize="characters" value={input} maxLength={100} onChange={e => setInput(e.target.value.toUpperCase())}
          className="rounded-xl border border-border px-3 py-2" required /></label>
      <button type="submit" disabled={!input.trim()} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50">LOT 조회</button>
    </form>
    {search && (!result ? <p className="text-sm text-muted">MES LOT를 조회하는 중…</p>
      : result.error ? <p className="text-sm text-danger" role="alert">{result.error}</p>
      : !result.rows?.length ? <p className="text-sm text-muted">{search.lotId}의 생산 설비·시간 기록이 없습니다.</p>
      : result.rows.map(lot => <div key={JSON.stringify([lot.lotId,lot.equipmentId,lot.startAt,lot.endAt])} className="space-y-2 border-t border-border pt-3">
        <p className="font-medium">{lot.lotId} · {lot.itemCode} · {lot.equipmentId || '설비 미기록'}</p>
        <p className="text-sm text-muted">{inspectionTime(lot.startAt)} ~ {lot.endAt ? inspectionTime(lot.endAt) : '진행 중'}</p>
        <LotInspectionRounds lot={lot}/>
      </div>))}
  </section>;
}

export default function LotInspectionRounds({ lot }) {
  const [result, setResult] = useState(null);
  const { equipmentId, startAt, endAt } = lot || {};
  useEffect(() => {
    if (!equipmentId || !startAt) return;
    let alive = true;
    setResult(null);
    fetchInspectionHeaders({ equipment: equipmentId, from: startAt, to: endAt || new Date().toISOString() })
      .then(data => { if (alive) setResult(data); })
      .catch(e => { if (alive) setResult({ error: e.message }); });
    return () => { alive = false; };
  }, [equipmentId, startAt, endAt]);
  return <section className="min-w-0 space-y-3">
    <h3 className="font-semibold">이 LOT 시간대의 생산조건 사진</h3>
    {!equipmentId || !startAt ? <p className="text-sm text-muted">LOT의 설비 또는 시작 시각이 미등록입니다.</p>
      : !result ? <p className="text-sm text-muted">회차를 조회하는 중…</p>
      : result.error ? <p role="alert" className="text-sm text-danger">{result.error}</p>
      : result.rows.length === 0 ? <p className="text-sm text-muted">같은 설비·시간대의 생산조건 점검 회차가 없습니다.</p>
      : result.rows.map(h => <InspectionRoundDetail key={h.id} id={h.id} />)}
  </section>;
}
