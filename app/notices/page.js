'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellOff, Pencil, Plus, Trash2 } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import MobileListCard, { MobileCardField } from '../../components/MobileListCard';
import ModalShell from '../../components/ModalShell';
import ConfirmDialog from '../../components/ConfirmDialog';
import NoticeEditModal from '../../components/NoticeEditModal';
import { getDisplayName } from '../../lib/analytics';
import {
  buildNoticeListRows,
  createNotice,
  deleteNotice,
  fetchCompanyId,
  fetchNoticeMessage,
  fetchNoticeReads,
  fetchNoticeThreads,
  getNoticeAudience,
  splitReadUnread,
  updateNotice,
} from '../../lib/notices';
import { supabase } from '../../lib/supabase';

/** 승인된 알림톡 6종에 공지 전용 템플릿 없음 → 버튼 비활성 */
const NOTICE_ALIMTALK_READY = false;

const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0';
const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50 md:min-h-0';

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

function ReadProgress({ readCount, audienceTotal }) {
  const total = audienceTotal || 0;
  const read = readCount || 0;
  const pct = total > 0 ? Math.min(100, Math.round((read / total) * 100)) : 0;
  return (
    <div className="min-w-[7rem]">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          {read} / {total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function WorkerNameList({ items, emptyLabel }) {
  if (!items.length) {
    return <p className="text-sm text-muted">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {items.map((item) => (
        <li
          key={item.worker_name}
          className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
        >
          <span className="font-medium text-text">{item.displayName}</span>
          {item.displayName !== item.worker_name ? (
            <span className="truncate text-xs text-muted">{item.worker_name}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function NoticeDetailModal({
  open,
  row,
  body,
  readList,
  unreadList,
  onClose,
  onEdit,
  onDelete,
}) {
  if (!open || !row) return null;

  return (
    <ModalShell
      title={row.title || '(제목 없음)'}
      eyebrow="NOTICE DETAIL"
      onClose={onClose}
      ariaLabel="공지 상세"
      maxWidthClass="md:max-w-2xl"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            닫기
          </button>
          <button type="button" onClick={onEdit} className={btnSecondary}>
            <Pencil className="h-4 w-4" strokeWidth={2} />
            수정
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 md:min-h-0"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            삭제
          </button>
        </div>
      }
    >
      <div className="space-y-5 px-4 py-5 md:px-6">
        <div className="flex flex-wrap gap-4 text-xs text-muted">
          <span>
            작성자{' '}
            <span className="font-medium text-text">{row.authorLabel}</span>
          </span>
          <span>
            작성일{' '}
            <span className="font-medium text-text">
              {formatDateTime(row.created_at)}
            </span>
          </span>
          <span>
            읽음{' '}
            <span className="font-medium text-text">
              {row.readCount} / {row.audienceTotal}
            </span>
          </span>
        </div>

        <div className="whitespace-pre-wrap rounded-xl border border-border bg-surface2/40 px-4 py-3 text-sm leading-relaxed text-text">
          {body || '(본문 없음)'}
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-text">
              미확인 ({unreadList.length})
            </h3>
            <button
              type="button"
              disabled={!NOTICE_ALIMTALK_READY || unreadList.length === 0}
              title={
                NOTICE_ALIMTALK_READY
                  ? '미확인자에게 알림톡 발송'
                  : '템플릿 승인 필요'
              }
              className={`${btnSecondary} disabled:cursor-not-allowed`}
            >
              <BellOff className="h-4 w-4" strokeWidth={2} />
              미확인자에게 알림톡 보내기
            </button>
          </div>
          {!NOTICE_ALIMTALK_READY ? (
            <p className="mb-2 text-[11px] text-muted">
              승인된 알림톡 템플릿 6종에 공지용이 없어 발송할 수 없습니다.
              (Solapi 사전 승인 필요)
            </p>
          ) : null}
          <WorkerNameList items={unreadList} emptyLabel="모두 확인했습니다." />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-text">
            확인 ({readList.length})
          </h3>
          <WorkerNameList items={readList} emptyLabel="아직 확인한 사람이 없습니다." />
        </div>
      </div>
    </ModalShell>
  );
}

export default function NoticesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [companyId, setCompanyId] = useState(null);
  const [workerDirectory, setWorkerDirectory] = useState([]);
  const [rows, setRows] = useState([]);

  const [detailRow, setDetailRow] = useState(null);
  const [detailBody, setDetailBody] = useState('');
  const [detailMessageId, setDetailMessageId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editMode, setEditMode] = useState('create');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const audience = useMemo(
    () => getNoticeAudience(workerDirectory),
    [workerDirectory]
  );

  const authorOptions = audience;

  const defaultAuthor = useMemo(() => {
    const manager = audience.find((w) => w.role === 'manager');
    return manager?.worker_name || audience[0]?.worker_name || '';
  }, [audience]);

  const loadList = useCallback(async () => {
    setError(null);
    const [company, directoryRes, threads] = await Promise.all([
      fetchCompanyId(),
      supabase.from('worker_directory').select('*').order('worker_name'),
      fetchNoticeThreads(),
    ]);
    if (directoryRes.error) throw new Error(directoryRes.error.message);

    const directory = directoryRes.data || [];
    const audienceRows = getNoticeAudience(directory);
    const reads = await fetchNoticeReads(threads.map((t) => t.id));
    const list = buildNoticeListRows(threads, reads, audienceRows).map((row) => ({
      ...row,
      authorLabel: getDisplayName(row.created_by_worker, directory),
    }));

    setCompanyId(company);
    setWorkerDirectory(directory);
    setRows(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadList();
      } catch (err) {
        if (!cancelled) setError(err?.message || '불러오기에 실패했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList]);

  const detailSplit = useMemo(() => {
    if (!detailRow) return { read: [], unread: [] };
    return splitReadUnread(
      audience,
      detailRow.readWorkerNames,
      workerDirectory
    );
  }, [detailRow, audience, workerDirectory]);

  async function openDetail(row) {
    setDetailRow(row);
    setDetailBody('');
    setDetailMessageId(null);
    setDetailLoading(true);
    try {
      const message = await fetchNoticeMessage(row.id);
      setDetailBody(message?.body_ko || message?.body || '');
      setDetailMessageId(message?.id ?? null);
    } catch (err) {
      setError(err?.message || '본문을 불러오지 못했습니다.');
    } finally {
      setDetailLoading(false);
    }
  }

  function openCreate() {
    setEditMode('create');
    setEditOpen(true);
  }

  function openEditFromDetail() {
    setEditMode('edit');
    setEditOpen(true);
  }

  async function handleSave({ title, body, createdByWorker, resetReads }) {
    setSaving(true);
    try {
      if (editMode === 'create') {
        const thread = await createNotice({
          title,
          body,
          companyId,
          createdByWorker,
        });
        setEditOpen(false);
        const list = await loadList();
        const listRow = list.find((r) => r.id === thread.id);
        if (listRow) await openDetail(listRow);
      } else if (detailRow) {
        await updateNotice({
          threadId: detailRow.id,
          messageId: detailMessageId,
          title,
          body,
          resetReads,
        });
        setEditOpen(false);
        const list = await loadList();
        const listRow = list.find((r) => r.id === detailRow.id);
        if (listRow) {
          // 읽음 초기화 시 readCount=0 인 행으로 상세·진행률 갱신
          await openDetail(listRow);
        } else {
          setDetailRow(null);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!detailRow) return;
    setDeleting(true);
    try {
      await deleteNotice(detailRow.id);
      setDeleteConfirm(false);
      setDetailRow(null);
      setEditOpen(false);
      await loadList();
    } catch (err) {
      setError(err?.message || '삭제에 실패했습니다.');
      setDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-muted">데이터 불러오는 중...</div>;
  }

  return (
    <div>
      <PageHeader
        eyebrow="SETTINGS"
        title="공지사항"
        description="앱 공지(thread type=notice)를 작성하고 확인 현황을 관리합니다."
      />

      <div className="space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            대상 인원 {audience.length}명 (removed=false) · 공지 {rows.length}건
          </p>
          <button type="button" onClick={openCreate} className={btnPrimary}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            새 공지
          </button>
        </div>

        {error ? (
          <div className="rounded-xl bg-dangerSoft px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        {/* desktop table */}
        <div className="hidden overflow-hidden rounded-xl border border-border bg-surface md:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface2/60 text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">제목</th>
                <th className="px-4 py-3 font-medium">작성자</th>
                <th className="px-4 py-3 font-medium">작성일</th>
                <th className="px-4 py-3 font-medium">읽음 진행률</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted">
                    등록된 공지가 없습니다. 「새 공지」로 작성하세요.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => openDetail(row)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-surface2/40"
                  >
                    <td className="px-4 py-3 font-medium text-text">
                      {row.title || '(제목 없음)'}
                    </td>
                    <td className="px-4 py-3 text-muted">{row.authorLabel}</td>
                    <td className="px-4 py-3 text-muted">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <ReadProgress
                        readCount={row.readCount}
                        audienceTotal={row.audienceTotal}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* mobile cards */}
        <div className="md:hidden">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              등록된 공지가 없습니다.
            </p>
          ) : (
            rows.map((row) => (
              <MobileListCard
                key={row.id}
                header={row.title || '(제목 없음)'}
                onClick={() => openDetail(row)}
              >
                <MobileCardField label="작성자">{row.authorLabel}</MobileCardField>
                <MobileCardField label="작성일">
                  {formatDateTime(row.created_at)}
                </MobileCardField>
                <MobileCardField label="읽음" className="col-span-2">
                  <ReadProgress
                    readCount={row.readCount}
                    audienceTotal={row.audienceTotal}
                  />
                </MobileCardField>
              </MobileListCard>
            ))
          )}
        </div>
      </div>

      <NoticeDetailModal
        open={Boolean(detailRow)}
        row={detailRow}
        body={detailLoading ? '불러오는 중...' : detailBody}
        readList={detailSplit.read}
        unreadList={detailSplit.unread}
        onClose={() => setDetailRow(null)}
        onEdit={openEditFromDetail}
        onDelete={() => setDeleteConfirm(true)}
      />

      <NoticeEditModal
        open={editOpen}
        mode={editMode}
        initialTitle={editMode === 'edit' ? detailRow?.title || '' : ''}
        initialBody={editMode === 'edit' ? detailBody : ''}
        readCount={editMode === 'edit' ? detailRow?.readCount || 0 : 0}
        authorOptions={authorOptions}
        workerDirectory={workerDirectory}
        defaultAuthor={defaultAuthor}
        saving={saving}
        onSave={handleSave}
        onClose={() => !saving && setEditOpen(false)}
      />

      <ConfirmDialog
        open={deleteConfirm}
        title="공지 삭제"
        message={`「${detailRow?.title || ''}」 공지를 삭제할까요? 앱에서도 더 이상 표시되지 않습니다.`}
        confirmLabel={deleting ? '삭제 중...' : '삭제'}
        confirmTone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => !deleting && setDeleteConfirm(false)}
      />
    </div>
  );
}
