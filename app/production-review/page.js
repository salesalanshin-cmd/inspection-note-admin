'use client';

import { useEffect, useState } from 'react';
import PageHeader from '../../components/PageHeader';
import LotInspectionRounds from '../../components/LotInspectionRounds';
import { notifyAction } from '../../lib/actionFeedback';

const processName = { GR: '사상', MC: '가공', IN: '검사', PT: '후처리' };
const field = 'rounded-xl border border-border bg-surface px-3 py-2 text-text';
async function query(body) {
  const res = await fetch('/api/production-review', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '조회에 실패했습니다.');
  return data;
}
function ReviewDetail({row, reload}) {
  const [lots,setLots]=useState([]);
  const [history,setHistory]=useState([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [actor,setActor]=useState('');
  const [reason,setReason]=useState('');
  const [good,setGood]=useState(String(row.effectiveGood ?? row.body.qtyGood ?? ''));
  useEffect(()=>{
    let live=true;
    Promise.all([query({action:'lots',lotId:row.lotId}),query({action:'history',resultId:row.id})])
      .then(([a,b])=>{if(live){setLots(a.rows);setHistory(b.rows);}})
      .catch(e=>{if(live)setError(e.message);});
    return ()=>{live=false;};
  },[row.id,row.lotId,row.revision]);
  async function save(event) {
    event.preventDefault();
    if(busy) return;
    setBusy(true);setError('');
    try {
      await query({action:'correct',resultId:row.id,requestId:crypto.randomUUID(),revision:row.revision,
        good:Number(good),actor:actor.trim(),reason:reason.trim()});
      notifyAction('검사노트 실적 수량을 정정했습니다.');reload();
    } catch(e) {setError(e.message);} finally {setBusy(false);}
  }
  return <div className="mt-4 space-y-4 border-t border-border pt-4">
    {error && <p role="alert">{error}</p>}
    {row.eventKind==='finish' && <form onSubmit={save} className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1">정정 양품 수량<input className={field} type="number" required min="0" max="2147483647" step="1" value={good} onChange={e=>setGood(e.target.value)}/></label>
      <label className="grid gap-1">처리자 이름<input className={field} required maxLength={100} value={actor} onChange={e=>setActor(e.target.value)}/></label>
      <label className="grid flex-1 gap-1">정정 사유<input className={field} required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button className={field} disabled={busy || !reason.trim() || !actor.trim()}>정정 저장</button>
      <p className="w-full text-sm">정정 수량은 검사노트 관리값입니다. MES 재고·작업일보 수량 수정은 MES에서 처리하세요.</p>
    </form>}
    {history.map(h=><p key={h.revision}>{new Date(h.createdAt).toLocaleString('ko-KR')} · {h.actor} · 양품 {h.beforeGood} → {h.afterGood} · {h.reason}</p>)}
    {lots.map((lot,i)=><LotInspectionRounds key={i} lot={lot}/>)}
  </div>;
}
export default function ProductionReviewPage() {
  const [filter,setFilter]=useState('mismatch');
  const [input,setInput]=useState('');
  const [lotId,setLotId]=useState('');
  const [offset,setOffset]=useState(0);
  const [version,setVersion]=useState(0);
  const [rows,setRows]=useState([]);
  const [selected,setSelected]=useState('');
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let live=true;setLoading(true);setError('');setRows([]);setSelected('');
    query({action:'list',filter,lotId:lotId||null,offset})
      .then(data=>{if(live)setRows(data.rows);}).catch(e=>{if(live)setError(e.message);})
      .finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[filter,lotId,offset,version]);
  return <><PageHeader eyebrow="MES" title="생산 LOT 점검" description="주조 양품과 후공정 입력 합계의 차이, MES 작업일보 미반영 사유를 확인합니다."/>
    <main className="space-y-4 p-4 md:p-8">
      <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();setOffset(0);setLotId(input.trim().toUpperCase());setVersion(v=>v+1);}}>
        <select aria-label="조회 구분" className={field} value={filter} onChange={e=>{setFilter(e.target.value);setOffset(0);}}>
          <option value="mismatch">수량 불일치 LOT</option><option value="bridge">MES 미반영 (브리지)</option>
        </select>
        <input aria-label="LOT 번호" className={field} placeholder="LOT 번호" value={input} maxLength={100} onChange={e=>setInput(e.target.value)}/>
        <button className={field}>조회</button>
      </form>
      {loading?<p>조회 중…</p>:error?<p role="alert">{error}</p>:rows.length===0?<p>해당하는 기록이 없습니다.</p>:rows.slice(0,50).map(r=><article className="rounded-xl border border-border bg-surface p-4" key={r.id}>
        <button className="w-full text-left" onClick={()=>setSelected(selected===r.id?'':r.id)} aria-expanded={selected===r.id}>
          <strong>{r.lotId} · {processName[r.body.processCode] || r.body.processCode} {r.eventKind==='start'?'착수':'실적'}</strong>
          <p>{r.body.workerName} · {new Date(r.body.occurredAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p>
          {r.eventKind==='finish' && <p>주조 {r.body.castingQuantity} · 입력 {r.body.qtyGood+(r.body.qtyDefect??0)} (양품 {r.body.qtyGood} · 불량 {r.body.qtyDefect??0}){r.effectiveGood!=null && ' · 정정 합계 '+(r.effectiveGood+(r.body.qtyDefect??0))}</p>}
          {r.body.bridgeReason && <p className="font-semibold">MES 미반영 · {r.body.bridgeReason}</p>}
        </button>
        {selected===r.id && <ReviewDetail row={r} reload={()=>setVersion(v=>v+1)}/>}
      </article>)}
      {(offset>0 || rows.length>50) && <nav className="flex gap-3" aria-label="페이지">
        <button className={field} disabled={offset===0} onClick={()=>setOffset(n=>n-50)}>이전</button>
        <button className={field} disabled={rows.length<=50} onClick={()=>setOffset(n=>n+50)}>다음</button>
      </nav>}
    </main></>;
}
