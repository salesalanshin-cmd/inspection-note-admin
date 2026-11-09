'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import WorklogPhotoViewer from '../../components/WorklogPhotoViewer';

const FORM_LABEL = {
  final_inspection: '최종검사',
  working_report: '작업일보',
};

const inputClass = 'w-full min-w-[88px] rounded-lg border border-border bg-white px-2 py-1 text-xs text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

const RAW_KEY = {
  workDate: 'date',
  itemCode: 'item_code',
  lotNo: 'lot_no',
  startTime: 'start',
  endTime: 'end',
  qty: 'qty',
  taskNote: 'task_note',
  processCode: 'site',
  defectBreakdown: 'defects',
};

function emptyValues() {
  return {
    workDate: '',
    itemCode: '',
    lotNo: '',
    startTime: '',
    endTime: '',
    qty: '',
    taskNote: '',
    processCode: '',
    defectBreakdown: [],
  };
}

function valuesFromRow(row) {
  return {
    workDate: row.workDate || '',
    itemCode: row.itemCode || '',
    lotNo: row.lotNo || '',
    startTime: row.startTime || '',
    endTime: row.endTime || '',
    qty: row.qty == null ? '' : String(row.qty),
    taskNote: row.taskNote || '',
    processCode: row.processCode || '',
    defectBreakdown: (row.defectBreakdown || []).map((item) => ({
      raw_code: item.raw_code || item.code || '',
      qty: item.qty == null ? '' : String(item.qty),
    })),
  };
}

function payloadFromValues(values) {
  return {
    ...values,
    qty: values.qty === '' ? null : Number(values.qty),
    defectBreakdown: (values.defectBreakdown || [])
      .filter((item) => String(item.raw_code || '').trim() || item.qty !== '')
      .map((item) => ({
        raw_code: item.raw_code,
        qty: item.qty === '' ? null : Number(item.qty),
      })),
  };
}

function rawTip(row, key) {
  if (row?.confidence !== 'low') return undefined;
  const value = row.raw?.[RAW_KEY[key]];
  const shown = value == null || value === ''
    ? '비어 있음'
    : (typeof value === 'object' ? JSON.stringify(value) : String(value));
  return `OCR 원문: ${shown}`;
}

function formatAccuracy(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

export default function WorklogReviewPage() {
  const [scope, setScope] = useState('needs');
  const [form, setForm] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [list, setList] = useState(null);
  const [listError, setListError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [detailError, setDetailError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ scope, form });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const response = await fetch(`/api/worklog-review?${params.toString()}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '목록을 불러오지 못했습니다.');
    setList(body);
    setSelectedId((current) => {
      if (current && body.photos.some((photo) => photo.id === current)) return current;
      return body.photos[0]?.id || null;
    });
  }, [scope, form, from, to]);

  useEffect(() => {
    let cancelled = false;
    setListError(null);
    loadList().catch((err) => {
      if (!cancelled) setListError(err.message);
    });
    return () => {
      cancelled = true;
    };
  }, [loadList]);

  const loadDetail = useCallback(async (id) => {
    const response = await fetch(`/api/worklog-review/${id}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '사진을 불러오지 못했습니다.');
    setDetail(body);
    const next = {};
    for (const row of body.rows) next[row.id] = valuesFromRow(row);
    setDrafts(next);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDrafts({});
      return undefined;
    }
    let cancelled = false;
    setDetailError(null);
    loadDetail(selectedId).catch((err) => {
      if (!cancelled) setDetailError(err.message);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, loadDetail]);

  const dirtyIds = useMemo(() => {
    if (!detail) return [];
    return detail.rows.filter((row) => {
      const draft = drafts[row.id];
      if (!draft) return false;
      return JSON.stringify(draft) !== JSON.stringify(valuesFromRow(row));
    }).map((row) => row.id).concat(
      Object.keys(drafts).filter((id) => id.startsWith('new-'))
    );
  }, [detail, drafts]);

  function updateDraft(id, patch) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] || emptyValues()), ...patch },
    }));
  }

  async function saveRow(id) {
    const values = drafts[id];
    if (!values) return;
    setBusy(true);
    setNotice(null);
    setDetailError(null);
    try {
      const isNew = id.startsWith('new-');
      const response = await fetch(isNew ? '/api/worklog-review/rows' : `/api/worklog-review/rows/${id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew
          ? { ocrResultId: selectedId, ...payloadFromValues(values) }
          : payloadFromValues(values)),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '저장에 실패했습니다.');
      setNotice(body.corrections ? `저장했습니다. 수정 ${body.corrections}칸.` : '저장했습니다.');
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(id) {
    if (id.startsWith('new-')) {
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }
    if (!window.confirm('이 행을 삭제할까요?')) return;
    setBusy(true);
    setNotice(null);
    setDetailError(null);
    try {
      const response = await fetch(`/api/worklog-review/rows/${id}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '삭제에 실패했습니다.');
      setNotice('행을 삭제했습니다.');
      await loadDetail(selectedId);
      await loadList();
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function addRow() {
    const id = `new-${crypto.randomUUID()}`;
    setDrafts((current) => ({ ...current, [id]: emptyValues() }));
  }

  const completePhoto = useCallback(async (andNext) => {
    if (!selectedId || busy) return;
    if (dirtyIds.length) {
      setDetailError('저장하지 않은 수정이 있습니다.');
      return;
    }
    const ids = list?.photos?.map((photo) => photo.id) || [];
    const nextId = ids[ids.indexOf(selectedId) + 1] || null;
    setBusy(true);
    setNotice(null);
    setDetailError(null);
    try {
      const response = await fetch(`/api/worklog-review/${selectedId}`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '검토 완료에 실패했습니다.');
      setNotice(`검토 완료. ${body.updated}행을 확인 처리했습니다.`);
      await loadList();
      if (andNext) setSelectedId(nextId);
      else await loadDetail(selectedId);
    } catch (err) {
      setDetailError(err.message);
    } finally {
      setBusy(false);
    }
  }, [selectedId, busy, dirtyIds.length, list, loadList, loadDetail]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        completePhoto(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [completePhoto]);

  function goNext() {
    if (dirtyIds.length) {
      setDetailError('저장하지 않은 수정이 있습니다.');
      return;
    }
    const ids = list?.photos?.map((photo) => photo.id) || [];
    const nextId = ids[ids.indexOf(selectedId) + 1] || null;
    setSelectedId(nextId);
  }

  const rows = [
    ...(detail?.rows || []),
    ...Object.keys(drafts).filter((id) => id.startsWith('new-')).map((id) => ({
      id,
      isNew: true,
      needsReview: false,
      confidence: null,
      isDuplicate: false,
      raw: null,
    })),
  ];
  const stats = list?.stats;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface px-4 py-4 md:px-6">
        <div className="text-xs font-medium text-accent">작업일보</div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-semibold text-text">작업일보 검토</h1>
          <div className="text-sm font-medium text-text">
            검토 남은 행 {list?.summary?.remainingRows ?? '—'}개 / 사진 {list?.summary?.photoCount ?? '—'}장
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">
            범위
            <select className={`${inputClass} mt-1`} value={scope} onChange={(event) => setScope(event.target.value)}>
              <option value="needs">검토 필요만</option>
              <option value="all">전체</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            양식
            <select className={`${inputClass} mt-1`} value={form} onChange={(event) => setForm(event.target.value)}>
              <option value="all">전체</option>
              <option value="final_inspection">최종검사</option>
              <option value="working_report">작업일보</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            근무일 시작
            <input className={`${inputClass} mt-1`} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="text-xs text-muted">
            근무일 끝
            <input className={`${inputClass} mt-1`} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
        {listError ? <p className="mt-3 text-sm text-danger">{listError}</p> : null}
      </header>

      <div className="grid min-h-[720px] flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-surface lg:border-b-0 lg:border-r">
          <div className="max-h-[240px] overflow-y-auto lg:max-h-[720px]">
            {(list?.photos || []).map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => setSelectedId(photo.id)}
                className={`block w-full border-b border-border px-3 py-2 text-left ${
                  photo.id === selectedId ? 'bg-accentSoft' : 'hover:bg-surface2'
                }`}
              >
                <div className="text-xs font-medium text-text">{photo.capturedAt || '촬영 시각 없음'}</div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {FORM_LABEL[photo.formType] || photo.formType || '양식 없음'}
                  {' · '}
                  검토 {photo.needsReviewCount}
                </div>
              </button>
            ))}
            {list && !list.photos.length ? (
              <p className="px-3 py-6 text-sm text-muted">조건에 맞는 사진이 없습니다.</p>
            ) : null}
          </div>
        </aside>

        <section className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2">
          <WorklogPhotoViewer src={detail?.photo?.imageUrl} alt="작업일보 원본" />
          <div className="flex min-w-0 flex-col rounded-xl border border-border bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <div className="min-w-0 flex-1 text-xs text-muted">
                {detail?.photo ? (
                  <>
                    <span className="font-medium text-text">{FORM_LABEL[detail.photo.formType] || detail.photo.formType}</span>
                    {' · '}
                    {detail.photo.capturedAt}
                    {detail.photo.workerName ? ` · ${detail.photo.workerName}` : ''}
                    {detail.photo.formEvidence ? <div className="mt-1 truncate" title={detail.photo.formEvidence}>{detail.photo.formEvidence}</div> : null}
                  </>
                ) : '사진을 고르세요.'}
              </div>
              <button type="button" className={actionClass} disabled={!selectedId || busy} onClick={addRow}>행 추가</button>
              <button type="button" className={primaryClass} disabled={!selectedId || busy} onClick={() => completePhoto(false)}>
                이 사진 검토 완료
              </button>
              <button type="button" className={actionClass} disabled={!selectedId || busy} onClick={goNext}>다음 사진</button>
            </div>
            <p className="px-3 pt-2 text-[11px] text-muted">Ctrl+Enter = 이 사진 검토 완료 후 다음 사진. 노란 행은 검토 필요이고, 신뢰도 low 칸은 OCR 원문을 툴팁으로 보여 줍니다.</p>
            {detailError ? <p className="px-3 pt-2 text-sm text-danger">{detailError}</p> : null}
            {notice ? <p className="px-3 pt-2 text-sm text-good">{notice}</p> : null}
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-surface2 text-left text-muted">
                  <tr>
                    {['근무일', '품번', 'LOT', '시작', '종료', '수량', '불량', '메모', '공정', '신뢰도', '중복', ''].map((label) => (
                      <th key={label || 'actions'} className="whitespace-nowrap px-2 py-2 font-medium">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const values = drafts[row.id] || emptyValues();
                    const low = row.confidence === 'low';
                    return (
                      <tr key={row.id} className={row.needsReview ? 'bg-warnSoft' : ''}>
                        <FieldCell tip={rawTip(row, 'workDate')} low={low}>
                          <input className={inputClass} type="date" value={values.workDate} onChange={(event) => updateDraft(row.id, { workDate: event.target.value })} />
                        </FieldCell>
                        <FieldCell tip={rawTip(row, 'itemCode')} low={low}>
                          <input className={inputClass} value={values.itemCode} onChange={(event) => updateDraft(row.id, { itemCode: event.target.value })} />
                        </FieldCell>
                        <FieldCell tip={rawTip(row, 'lotNo')} low={low}>
                          <input className={inputClass} value={values.lotNo} onChange={(event) => updateDraft(row.id, { lotNo: event.target.value })} />
                        </FieldCell>
                        <FieldCell tip={rawTip(row, 'startTime')} low={low}>
                          <input className={inputClass} value={values.startTime} onChange={(event) => updateDraft(row.id, { startTime: event.target.value })} />
                        </FieldCell>
                        <FieldCell tip={rawTip(row, 'endTime')} low={low}>
                          <input className={inputClass} value={values.endTime} onChange={(event) => updateDraft(row.id, { endTime: event.target.value })} />
                        </FieldCell>
                        <FieldCell tip={rawTip(row, 'qty')} low={low}>
                          <input className={inputClass} inputMode="numeric" value={values.qty} onChange={(event) => updateDraft(row.id, { qty: event.target.value })} />
                        </FieldCell>
                        <td className="px-2 py-1 align-top" title={rawTip(row, 'defectBreakdown')}>
                          <DefectFields
                            items={values.defectBreakdown}
                            onChange={(defectBreakdown) => updateDraft(row.id, { defectBreakdown })}
                          />
                        </td>
                        <FieldCell tip={rawTip(row, 'taskNote')} low={low}>
                          <input className={inputClass} value={values.taskNote} onChange={(event) => updateDraft(row.id, { taskNote: event.target.value })} />
                        </FieldCell>
                        <FieldCell tip={rawTip(row, 'processCode')} low={low}>
                          <input className={inputClass} value={values.processCode} onChange={(event) => updateDraft(row.id, { processCode: event.target.value })} />
                        </FieldCell>
                        <td className={`whitespace-nowrap px-2 py-2 ${low ? 'font-medium text-warn' : 'text-muted'}`}>{row.confidence || '—'}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-muted">{row.isDuplicate ? '예' : '아니오'}</td>
                        <td className="whitespace-nowrap px-2 py-1">
                          <button type="button" className={actionClass} disabled={busy} onClick={() => saveRow(row.id)}>행 저장</button>
                          <button type="button" className={`${actionClass} ml-1`} disabled={busy} onClick={() => deleteRow(row.id)}>행 삭제</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-border bg-surface px-4 py-4 md:px-6">
        <h2 className="text-sm font-semibold text-text">OCR 인식 정확도</h2>
        <p className="mt-1 text-xs text-muted">수량 정확도 = 1 - (qty를 수정한 행 / 검토한 행)</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Stat label="검토한 행" value={stats ? `${stats.reviewedRows}행` : '—'} />
          <Stat label="수정된 행" value={stats ? `${stats.editedRows}행` : '—'} />
          <Stat label="날짜 수정" value={stats ? `${stats.fieldCounts.work_date}회` : '—'} />
          <Stat label="품번 수정" value={stats ? `${stats.fieldCounts.item_code}회` : '—'} />
          <Stat label="수량 수정" value={stats ? `${stats.fieldCounts.qty}회` : '—'} />
          <Stat label="불량 수정" value={stats ? `${stats.fieldCounts.defect_breakdown}회` : '—'} />
        </div>
        <p className="mt-3 text-sm text-text">
          수량 정확도 <span className="font-semibold">{formatAccuracy(stats?.qtyAccuracy)}</span>
          {stats ? ` (수량 수정 ${stats.qtyEditedRows}행 / 검토 ${stats.reviewedRows}행)` : ''}
        </p>
      </footer>
    </div>
  );
}

function FieldCell({ children, tip, low }) {
  return (
    <td className={`px-2 py-1 align-top ${low ? 'outline outline-1 outline-warn/50' : ''}`} title={tip}>
      {children}
    </td>
  );
}

function DefectFields({ items, onChange }) {
  const list = items || [];
  return (
    <div className="min-w-[140px] space-y-1">
      {list.map((item, index) => (
        <div key={index} className="flex gap-1">
          <input
            className={inputClass}
            placeholder="코드"
            value={item.raw_code}
            onChange={(event) => {
              const next = list.slice();
              next[index] = { ...item, raw_code: event.target.value };
              onChange(next);
            }}
          />
          <input
            className={`${inputClass} max-w-[64px]`}
            placeholder="수량"
            inputMode="numeric"
            value={item.qty}
            onChange={(event) => {
              const next = list.slice();
              next[index] = { ...item, qty: event.target.value };
              onChange(next);
            }}
          />
        </div>
      ))}
      <button
        type="button"
        className="text-[11px] text-accent"
        onClick={() => onChange([...list, { raw_code: '', qty: '' }])}
      >
        + 불량
      </button>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-surface2 px-3 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-1 text-sm font-medium text-text">{value}</div>
    </div>
  );
}

const actionClass = 'rounded-xl border border-border px-2.5 py-1.5 text-xs text-muted hover:bg-surface2 hover:text-text disabled:opacity-50';
const primaryClass = 'rounded-xl bg-accent px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50';
