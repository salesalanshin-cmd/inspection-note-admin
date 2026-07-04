'use client';

import { useMemo, useState } from 'react';
import { useTrash, trashItemKey, parseTrashItemKey } from '../../lib/useTrash';
import {
  permanentlyDelete,
  restoreFromTrash,
  TRASH_TABLES,
} from '../../lib/trash';
import PageHeader from '../../components/PageHeader';
import SignedImage from '../../components/SignedImage';
import ConfirmDialog from '../../components/ConfirmDialog';
import { defectLabel, docLabel, fivesLabel } from '../../lib/constants';

const TRASH_RETENTION_DAYS = 30;

const filterTabs = [
  { id: 'all', label: '전체' },
  { id: 'defect', label: '불량기록' },
  { id: 'fives', label: '3정5S' },
  { id: 'doc', label: '문서스캔' },
];

function daysSince(iso) {
  if (!iso) return 0;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function itemTitle(item) {
  if (item.recordType === 'defect') return defectLabel(item);
  if (item.recordType === 'fives') return fivesLabel(item);
  return docLabel(item);
}

export default function TrashPage() {
  const { loading, error, items, refetch, removeItems } = useTrash();
  const [filter, setFilter] = useState('all');
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => item.recordType === filter);
  }, [items, filter]);

  const oldCount = useMemo(
    () => items.filter((item) => daysSince(item.deleted_at) > TRASH_RETENTION_DAYS).length,
    [items]
  );

  const selectedCount = selectedKeys.size;

  function toggle(key) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedKeys(new Set(filtered.map(trashItemKey)));
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  function groupSelectedByTable() {
    const groups = { defect: [], fives: [], doc: [] };
    for (const key of selectedKeys) {
      const { recordType, id } = parseTrashItemKey(key);
      if (groups[recordType]) groups[recordType].push(id);
    }
    return groups;
  }

  async function handleRestore() {
    setActionLoading(true);
    try {
      const groups = groupSelectedByTable();
      await Promise.all([
        restoreFromTrash(TRASH_TABLES.defect, groups.defect),
        restoreFromTrash(TRASH_TABLES.fives, groups.fives),
        restoreFromTrash(TRASH_TABLES.doc, groups.doc),
      ]);
      clearSelection();
      setRestoreConfirm(false);
      refetch();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[trash restore]', err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePermanentDelete() {
    const groups = groupSelectedByTable();
    const requestedTotal =
      groups.defect.length + groups.fives.length + groups.doc.length;
    const selectedSnapshot = new Set(selectedKeys);

    setActionLoading(true);
    setDeleteError(null);
    setDeleteConfirm(false);

    // 낙관적 업데이트: 화면 목록에서 먼저 제거 (실패 시 refetch로 복원)
    removeItems(selectedSnapshot);

    try {
      const results = await Promise.all([
        permanentlyDelete(TRASH_TABLES.defect, groups.defect),
        permanentlyDelete(TRASH_TABLES.fives, groups.fives),
        permanentlyDelete(TRASH_TABLES.doc, groups.doc),
      ]);
      const deletedTotal = results.reduce((sum, rows) => sum + rows.length, 0);

      // eslint-disable-next-line no-console
      console.log('[trash delete] 요청', requestedTotal, '건 / 실제 삭제', deletedTotal, '건', {
        defect: results[0],
        fives: results[1],
        doc: results[2],
      });

      if (deletedTotal < requestedTotal) {
        // error는 없지만 삭제된 row가 부족 → RLS DELETE 정책 부재로 조용히 실패한 경우
        const msg = `삭제 실패: RLS 정책 필요 — 요청 ${requestedTotal}건 중 ${deletedTotal}건만 삭제되었습니다. Supabase에서 defect_reports / fives_reports / ocr_results 테이블에 DELETE RLS 정책을 추가해야 합니다.`;
        // eslint-disable-next-line no-console
        console.error('[trash delete]', msg);
        setDeleteError(msg);
        refetch(); // 실제 서버 상태로 복원
        return;
      }

      clearSelection();
      refetch();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[trash delete]', err);
      setDeleteError(`삭제 실패: ${err?.message || err}`);
      refetch(); // 낙관적 제거 복원
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="p-8 text-muted text-sm">데이터 불러오는 중...</div>;
  if (error) return <div className="p-8 text-danger text-sm">오류: {error}</div>;

  return (
    <div>
      <PageHeader
        eyebrow="TRASH"
        title="휴지통"
        description={`삭제된 항목 ${items.length}건`}
      />

      <div className="p-8 space-y-6">
        {oldCount > 0 ? (
          <div className="rounded-xl border border-warn/30 bg-warnSoft px-4 py-3 text-sm text-warn">
            30일 지난 항목 {oldCount}개 — 완전삭제를 권장합니다. (자동 삭제는 하지 않습니다)
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`rounded-xl px-3 py-1.5 text-sm transition-colors ${
                  filter === tab.id
                    ? 'bg-accentSoft text-accent font-medium'
                    : 'border border-border text-muted hover:bg-surface2 hover:text-text'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={selectAllVisible}
            disabled={filtered.length === 0}
            className="rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50"
          >
            전체 선택
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={selectedCount === 0}
            className="rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:bg-surface2 hover:text-text disabled:opacity-50"
          >
            선택 해제
          </button>
          <button
            type="button"
            onClick={() => setRestoreConfirm(true)}
            disabled={selectedCount === 0}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            선택 복구 ({selectedCount})
          </button>
          <button
            type="button"
            onClick={() => setDeleteConfirm(true)}
            disabled={selectedCount === 0}
            className="rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            선택 완전삭제 ({selectedCount})
          </button>
        </div>

        {deleteError ? (
          <div className="rounded-xl border border-danger/30 bg-dangerSoft px-4 py-3 text-sm text-danger">
            {deleteError}
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((item) => {
            const key = trashItemKey(item);
            return (
              <div key={key} className="bg-surface rounded-xl shadow-card overflow-hidden">
                <div className="relative aspect-square bg-surface2">
                  <label className="absolute top-2 left-2 z-30 flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface/90">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(key)}
                      onChange={() => toggle(key)}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                  </label>
                  {item.image_url ? (
                    <SignedImage url={item.image_url} alt={itemTitle(item)} />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-muted text-xs">
                      이미지 없음
                    </div>
                  )}
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-surface2 text-text text-[10px] font-medium rounded-full">
                    {item.typeLabel}
                  </div>
                </div>
                <div className="p-2.5 text-xs">
                  <div className="text-text font-medium truncate">{itemTitle(item)}</div>
                  <div className="text-muted mt-0.5">{item.worker_name || '작업자 미상'}</div>
                  <div className="text-muted mt-0.5">
                    삭제:{' '}
                    {item.deleted_at
                      ? new Date(item.deleted_at).toLocaleString('ko-KR')
                      : '—'}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted text-xs">
              휴지통이 비어 있습니다
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={restoreConfirm}
        title="선택 항목 복구"
        message={`선택한 ${selectedCount}개 항목을 복구합니다. 목록 화면에 다시 표시됩니다.`}
        confirmLabel="복구"
        loading={actionLoading}
        onConfirm={handleRestore}
        onCancel={() => setRestoreConfirm(false)}
      />

      <ConfirmDialog
        open={deleteConfirm}
        title="완전 삭제"
        message={`선택한 ${selectedCount}개 항목을 완전히 삭제합니다. 이 작업은 되돌릴 수 없으며, 데이터가 영구적으로 제거됩니다. 정말 계속하시겠습니까?`}
        confirmLabel="완전 삭제"
        confirmTone="danger"
        loading={actionLoading}
        onConfirm={handlePermanentDelete}
        onCancel={() => setDeleteConfirm(false)}
      />
    </div>
  );
}
