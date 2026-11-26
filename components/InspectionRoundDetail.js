'use client';

import { useEffect, useState } from 'react';
import SignedImage from './SignedImage';
import { notifyAction } from '../lib/actionFeedback';
import { fetchInspectionHeaderDetail } from '../lib/inspection/clientApi';
import { inspectionTime, lotOverlapsRound, roundInterval, roundLabels } from '../lib/inspection/rounds';

const field = 'rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text';
const button = field + ' font-medium hover:bg-surface2 disabled:opacity-50';

export default function InspectionRoundDetail({ id, editable = false, onChange, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [version, setVersion] = useState(0);
  const [action, setAction] = useState('');
  const [lots, setLots] = useState(null);
  const [lotId, setLotId] = useState('');
  const [actor, setActor] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const header = detail?.header;

  useEffect(() => {
    let alive = true;
    setError('');
    fetchInspectionHeaderDetail(id).then(result => {
      if (alive) setDetail(result);
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id, version]);

  useEffect(() => {
    if (!header || action !== 'correct') return;
    const abort = new AbortController();
    setLots(null);
    setLotId('');
    (async () => {
      const response = await fetch('/api/production-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ action: 'lots', equipmentId: header.equipment_code, ...roundInterval(header) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'MES LOT를 조회하지 못했습니다.');
      const matches = (data.rows || []).filter(row => row.itemCode && lotOverlapsRound(row, header));
      const rows = [...new Map(matches.map(row => [row.lotId, row])).values()];
      setLots(rows);
      if (rows.length === 1) setLotId(rows[0].lotId);
    })().catch(e => {
      if (!abort.signal.aborted) { setLots([]); setNotice(e.message); }
    });
    return () => abort.abort();
  }, [header, action]);

  function begin(next) {
    setNotice(''); setAction(next); setReason('');
  }

  async function save(event) {
    event.preventDefault();
    if (saving || !actor.trim() || !reason.trim() || (action === 'correct' && !lotId)) return;
    setSaving(true); setNotice('');
    try {
      const response = await fetch('/api/inspection/headers/' + encodeURIComponent(id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, actor, reason, lotId,
          expected: { part_no: header.part_no, lot_no: header.lot_no, round_status: header.round_status } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '회차를 변경하지 못했습니다.');
      notifyAction(action === 'correct' ? 'MES LOT의 품번을 적용했습니다.' : '확정 회차를 취소했습니다.');
      setAction(''); setVersion(v => v + 1); onChange?.();
    } catch (e) { setNotice(e.message); notifyAction(e.message, 'error'); }
    finally { setSaving(false); }
  }

  if (error) return <p role="alert" className="text-danger">{error}</p>;
  if (!header) return <p className="text-muted">회차를 불러오는 중…</p>;
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{header.equipment_name || header.equipment_code} · {header.round_no}회차 · {roundLabels[header.round_status]}</h3>
          <p className="mt-1 text-sm text-muted">{header.work_date} 근무일 · 시작 {inspectionTime(header.created_at)} · 사진 {header.progress_label}</p>
          {header.confirmed_at && <p className="text-sm text-muted">확정 {inspectionTime(header.confirmed_at)} · {header.confirmed_by || '확정자 미기록'}</p>}
          <p className="mt-1 text-sm">품번 {header.part_no || '미입력'} · LOT {header.lot_no || '미입력'} · 최초 작업자 {header.worker_name || '미기록'}</p>
        </div>
        {onClose && <button type="button" className={button} onClick={onClose}>닫기</button>}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2" aria-label="회차 항목별 사진" tabIndex={0}>
        {detail.items.map(item => (
          <figure key={item.id} className="w-40 shrink-0 overflow-hidden rounded-xl border border-border bg-surface2">
            <div className="relative aspect-square bg-border/40">
              {item.active_photo?.photo_url ? <SignedImage url={item.active_photo.photo_url} alt={item.title} bucket="defect-images" size="thumbnail" sizes="160px" />
                : <div className="flex h-full items-center justify-center text-sm text-muted">사진 없음</div>}
            </div>
            <figcaption className="space-y-1 p-2 text-sm">
              <p className="font-semibold">{item.item_no}. {item.title}</p>
              {item.active_photo && <>
                <p>{inspectionTime(item.active_photo.captured_at)}</p>
                <p className="text-muted">촬영자 {item.active_photo.worker_name || '미기록'}</p>
              </>}
              {item.replaced_count > 0 && <p className="text-muted">교체 {item.replaced_count}건</p>}
            </figcaption>
          </figure>
        ))}
      </div>
      {editable && header.round_status !== 'cancelled' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={saving} className={button} onClick={() => begin('correct')}>LOT로 품번 채우기</button>
          {header.round_status === 'confirmed' && <button type="button" disabled={saving} className={button + ' text-danger'} onClick={() => begin('cancel')}>회차 취소</button>}
        </div>
      )}
      {editable && action && <form onSubmit={save} className="flex flex-wrap items-end gap-3 rounded-xl bg-surface2 p-3">
        {action === 'correct' && <label className="flex min-w-0 flex-col gap-1 text-sm">같은 설비·시간대의 MES LOT
          <select required className={field} value={lotId} onChange={e => setLotId(e.target.value)} disabled={saving || !lots?.length}>
            <option value="">{lots === null ? '조회 중…' : lots.length ? 'LOT 선택' : '일치하는 LOT 없음'}</option>
            {lots?.map(lot => <option key={lot.lotId} value={lot.lotId}>{lot.lotId} · {lot.itemCode} · {inspectionTime(lot.startAt)}</option>)}
          </select></label>}
        <label className="flex flex-col gap-1 text-sm">처리자 이름<input required maxLength={80} className={field} value={actor} onChange={e => setActor(e.target.value)} /></label>
        <label className="flex grow flex-col gap-1 text-sm">{action === 'correct' ? '보정 사유' : '취소 사유'}
          <input required maxLength={500} className={field} value={reason} onChange={e => setReason(e.target.value)} /></label>
        <button type="submit" className={button} disabled={saving || !actor.trim() || !reason.trim() || (action === 'correct' && !lotId)}>{saving ? '저장 중…' : action === 'correct' ? '품번 적용' : '회차 취소 확정'}</button>
        <button type="button" className={button} disabled={saving} onClick={() => begin('')}>닫기</button>
      </form>}
      {notice && <p role="alert" className="text-sm text-danger">{notice}</p>}
      {detail.audit?.length > 0 && <div className="space-y-2 text-sm">
        <h4 className="font-semibold">변경 이력</h4>
        {detail.audit.map(entry => <div key={entry.id} className="rounded-xl bg-surface2 p-2">
          {inspectionTime(entry.created_at)} · {entry.actor} · {entry.action === 'cancel' ? '회차 취소' : '품번 보정'} · {entry.reason}
          {entry.action === 'correct' && <p className="text-muted">품번 {entry.old_part_no || '미입력'} → {entry.new_part_no || '미입력'} · LOT {entry.old_lot_no || '미입력'} → {entry.new_lot_no || '미입력'}</p>}
        </div>)}
      </div>}
    </section>
  );
}
