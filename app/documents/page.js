'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  History,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import ModalShell, { ModalFooterActions } from '../../components/ModalShell';
import ConfirmDialog from '../../components/ConfirmDialog';
import { getCompanyId } from '../../lib/company';
import { supabase } from '../../lib/supabase';
import { ALLOWED_EXTENSIONS } from '../../lib/documents/constants';
import {
  buildFolderTree,
  folderBreadcrumb,
  canCreateUnder,
} from '../../lib/documents/folders';
import {
  buildSupersededIds,
  countByFilter,
  matchesDocumentFilter,
} from '../../lib/documents/listFilters';
import { isProcessingStatus, STATUS_LABELS } from '../../lib/documents/statusLabels';

const btnPrimary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-0';
const btnSecondary =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface2 disabled:opacity-50 md:min-h-0';

/** dataTransfer MIME — documentId 전달 */
const DRAG_DOC_MIME = 'application/x-document-id';
/** hoverDropTarget 상태용 — 폴더 미지정 드롭 (API에는 null) */
const DROP_UNFOLDERED = '__unfoldered__';

function folderIdsEqual(a, b) {
  return (a ?? null) === (b ?? null);
}

function dropTargetKey(folderId) {
  return folderId == null ? DROP_UNFOLDERED : folderId;
}

function parseDropTargetKey(key) {
  return key === DROP_UNFOLDERED ? null : key;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR');
}

function StatusBadge({ status }) {
  const tone =
    status === 'ready'
      ? 'bg-goodSoft text-good'
      : status === 'failed'
        ? 'bg-dangerSoft text-danger'
        : isProcessingStatus(status)
          ? 'bg-warnSoft text-warn'
          : 'bg-surface2 text-muted';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

/** 구버전: 회색 배지 + 검색 제외 툴팁. 최신본: vN 배지 */
function VersionBadge({ version, isOldVersion }) {
  if (isOldVersion) {
    return (
      <span
        title="이 문서는 검색에서 제외됩니다"
        className="inline-flex cursor-help rounded-full bg-surface2 px-2.5 py-0.5 text-xs font-medium text-muted"
      >
        구버전
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-accentSoft px-2.5 py-0.5 text-xs font-medium text-accent">
      v{version || 1}
    </span>
  );
}

function FolderTreeNode({
  folder,
  depth,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  dropTargetKey: nodeDropKey,
  hoverDropTarget,
  draggingDocId,
  isValidDrop,
  onDropTargetEnter,
  onDropTargetLeave,
  onDropOnFolder,
}) {
  const isOpen = expanded.has(folder.id);
  const isSelected = selectedId === folder.id;
  const isHover = hoverDropTarget === nodeDropKey;
  const canDrop = draggingDocId && isValidDrop(parseDropTargetKey(nodeDropKey));
  const dropRing = isHover && canDrop ? 'ring-2 ring-accent bg-accentSoft/40' : '';
  const dropDenied = isHover && draggingDocId && !canDrop ? 'cursor-not-allowed' : '';

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg pr-1 text-sm ${dropRing} ${dropDenied} ${
          isSelected && !isHover ? 'bg-accentSoft text-accent' : 'text-text hover:bg-surface2'
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (canDrop) {
            e.dataTransfer.dropEffect = 'move';
            onDropTargetEnter(nodeDropKey);
          } else {
            e.dataTransfer.dropEffect = 'none';
            onDropTargetEnter(nodeDropKey);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            onDropTargetLeave(nodeDropKey);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDropOnFolder(parseDropTargetKey(nodeDropKey));
          onDropTargetLeave(nodeDropKey);
        }}
      >
        <button type="button" className="p-1" onClick={() => onToggle(folder.id)} aria-label="펼치기">
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted" />
          )}
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
          onClick={() => onSelect(folder.id)}
        >
          <Folder className="h-4 w-4 shrink-0" />
          <span className="truncate">{folder.name}</span>
        </button>
        <div className="hidden gap-0.5 group-hover:flex">
          <button
            type="button"
            className="rounded p-1 text-muted hover:text-text"
            onClick={() => onRename(folder)}
            aria-label="이름 변경"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-muted hover:text-danger"
            onClick={() => onDelete(folder)}
            aria-label="삭제"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function isAllowedFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

export default function KnowledgeDocumentsPage() {
  const [folders, setFolders] = useState([]);
  const [rows, setRows] = useState([]);
  const [chunkCounts, setChunkCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set());

  const [filters, setFilters] = useState({
    showProcessing: false,
    showFailed: false,
    showInactive: false,
    showOldVersions: false,
    showUnfolderedOnly: false,
  });

  const [historyDoc, setHistoryDoc] = useState(null);
  const [historyChain, setHistoryChain] = useState([]);
  const [reprocessId, setReprocessId] = useState(null);

  const [editDoc, setEditDoc] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editFolderId, setEditFolderId] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  const [folderDialog, setFolderDialog] = useState(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [folderSaving, setFolderSaving] = useState(false);

  const [moveDoc, setMoveDoc] = useState(null);
  const [moveFolderId, setMoveFolderId] = useState('');

  const [uploadQueue, setUploadQueue] = useState([]);
  const [revisionPrompt, setRevisionPrompt] = useState(null);
  const uploadInputRef = useRef(null);

  const [draggingDocId, setDraggingDocId] = useState(null);
  const [hoverDropTarget, setHoverDropTarget] = useState(undefined);
  const [moveError, setMoveError] = useState(null);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const treeByParent = useMemo(() => buildFolderTree(folders), [folders]);
  const supersededIds = useMemo(() => buildSupersededIds(rows), [rows]);
  const filterCounts = useMemo(() => countByFilter(rows, supersededIds), [rows, supersededIds]);

  const breadcrumb = useMemo(
    () => folderBreadcrumb(selectedFolderId, folders),
    [selectedFolderId, folders]
  );

  const fetchAll = useCallback(async () => {
    try {
      const companyId = await getCompanyId();
      const [folderRes, docRes] = await Promise.all([
        fetch('/api/documents/folders').then((r) => r.json()),
        supabase
          .from('document')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
      ]);

      if (folderRes.error) throw new Error(folderRes.error);
      if (docRes.error) throw new Error(docRes.error.message);

      setFolders(folderRes.folders || []);
      const docs = docRes.data || [];
      setRows(docs);

      if (docs.length) {
        const ids = docs.map((d) => d.id);
        const { data: chunks } = await supabase
          .from('document_chunk')
          .select('document_id')
          .eq('company_id', companyId)
          .in('document_id', ids);
        const counts = {};
        for (const c of chunks || []) {
          counts[c.document_id] = (counts[c.document_id] || 0) + 1;
        }
        setChunkCounts(counts);
      } else {
        setChunkCounts({});
      }
      setError(null);
    } catch (err) {
      setError(err.message || '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const hasProcessing = useMemo(
    () => rows.some((r) => isProcessingStatus(r.status)),
    [rows]
  );

  useEffect(() => {
    if (!hasProcessing) return undefined;
    const timer = setInterval(fetchAll, 3000);
    return () => clearInterval(timer);
  }, [hasProcessing, fetchAll]);

  const visibleDocs = useMemo(() => {
    return rows.filter((doc) => {
      if (selectedFolderId != null) {
        if (doc.folder_id !== selectedFolderId) return false;
      } else if (filters.showUnfolderedOnly && doc.folder_id != null) {
        return false;
      }
      return matchesDocumentFilter(doc, supersededIds, filters);
    });
  }, [rows, selectedFolderId, filters, supersededIds]);

  const isValidDrop = useCallback(
    (targetFolderId) => {
      if (!draggingDocId) return false;
      const doc = rows.find((r) => r.id === draggingDocId);
      if (!doc) return false;
      return !folderIdsEqual(doc.folder_id, targetFolderId);
    },
    [draggingDocId, rows]
  );

  const moveDocumentToFolder = useCallback(
    async (documentId, targetFolderId) => {
      const doc = rows.find((r) => r.id === documentId);
      if (!doc) return;
      if (folderIdsEqual(doc.folder_id, targetFolderId)) return;

      const prevRows = rows;
      setMoveError(null);
      setRows((prev) =>
        prev.map((r) =>
          r.id === documentId ? { ...r, folder_id: targetFolderId ?? null } : r
        )
      );

      try {
        const res = await fetch(`/api/documents/${documentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId: targetFolderId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '이동 실패');
      } catch (err) {
        setRows(prevRows);
        setMoveError(err.message || '문서 이동에 실패했습니다.');
      }
    },
    [rows]
  );

  function handleDragStart(e, docId) {
    if (e.target.closest('a, button, input, select, textarea')) {
      e.preventDefault();
      return;
    }
    setDraggingDocId(docId);
    setMoveError(null);
    e.dataTransfer.setData(DRAG_DOC_MIME, docId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    setDraggingDocId(null);
    setHoverDropTarget(undefined);
  }

  function handleDropOnFolder(targetFolderId) {
    const docId = draggingDocId;
    if (!docId) return;
    const doc = rows.find((r) => r.id === docId);
    if (!doc || folderIdsEqual(doc.folder_id, targetFolderId)) return;
    setDraggingDocId(null);
    setHoverDropTarget(undefined);
    moveDocumentToFolder(docId, targetFolderId);
  }

  function getDropTargetProps(folderId) {
    const key = dropTargetKey(folderId);
    const isHover = hoverDropTarget === key;
    const canDrop = draggingDocId && isValidDrop(folderId);
    return {
      key,
      isHover,
      canDrop,
      onDragOver: (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (canDrop) e.dataTransfer.dropEffect = 'move';
        else e.dataTransfer.dropEffect = 'none';
        setHoverDropTarget(key);
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setHoverDropTarget((prev) => (prev === key ? undefined : prev));
        }
      },
      onDrop: (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDropOnFolder(folderId);
      },
      className:
        isHover && canDrop
          ? 'ring-2 ring-accent bg-accentSoft/40 rounded-lg'
          : isHover && draggingDocId && !canDrop
            ? 'cursor-not-allowed rounded-lg'
            : '',
    };
  }

  function toggleFolderExpand(id) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderFolderNodes(parentKey, depth) {
    const list = treeByParent.get(parentKey) || [];
    return list.map((folder) => (
      <div key={folder.id}>
        <FolderTreeNode
          folder={folder}
          depth={depth}
          selectedId={selectedFolderId}
          expanded={expandedFolders}
          onToggle={toggleFolderExpand}
          onSelect={setSelectedFolderId}
          onRename={(f) => {
            setFolderDialog({ mode: 'rename', folder: f });
            setFolderNameInput(f.name);
          }}
          onDelete={(f) => setFolderDialog({ mode: 'delete', folder: f })}
          dropTargetKey={dropTargetKey(folder.id)}
          hoverDropTarget={hoverDropTarget}
          draggingDocId={draggingDocId}
          isValidDrop={isValidDrop}
          onDropTargetEnter={setHoverDropTarget}
          onDropTargetLeave={(key) =>
            setHoverDropTarget((prev) => (prev === key ? undefined : prev))
          }
          onDropOnFolder={handleDropOnFolder}
        />
        {expandedFolders.has(folder.id)
          ? renderFolderNodes(folder.id, depth + 1)
          : null}
      </div>
    ));
  }

  async function saveFolderDialog() {
    if (!folderDialog || folderSaving) return;
    setFolderSaving(true);
    try {
      if (folderDialog.mode === 'create') {
        const parentId = selectedFolderId;
        if (parentId && !canCreateUnder(parentId, folderById)) {
          throw new Error('폴더는 최대 3단계까지만 만들 수 있습니다.');
        }
        const res = await fetch('/api/documents/folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: folderNameInput, parentId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (parentId) setExpandedFolders((p) => new Set(p).add(parentId));
      } else if (folderDialog.mode === 'rename') {
        const res = await fetch(`/api/documents/folders/${folderDialog.folder.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: folderNameInput }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
      } else if (folderDialog.mode === 'delete') {
        const res = await fetch(`/api/documents/folders/${folderDialog.folder.id}`, {
          method: 'DELETE',
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (selectedFolderId === folderDialog.folder.id) {
          setSelectedFolderId(folderDialog.folder.parent_id);
        }
      }
      setFolderDialog(null);
      setFolderNameInput('');
      await fetchAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setFolderSaving(false);
    }
  }

  async function handleReprocess(documentId) {
    setReprocessId(documentId);
    try {
      const res = await fetch('/api/documents/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '재처리 실패');
      fetchAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setReprocessId(null);
    }
  }

  async function bulkDeactivateFailed() {
    if (!filterCounts.failed) return;
    if (!window.confirm(`실패 문서 ${filterCounts.failed}건을 비활성화할까요? (삭제 아님)`)) return;
    const res = await fetch('/api/documents/bulk-deactivate-failed', { method: 'POST' });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error || '정리 실패');
      return;
    }
    alert(`${json.count}건 비활성화했습니다.`);
    fetchAll();
  }

  async function openHistory(doc) {
    setHistoryDoc(doc);
    const companyId = await getCompanyId();

    const successorBySupersedes = new Map();
    for (const d of rows) {
      if (d.supersedes) successorBySupersedes.set(d.supersedes, d.id);
    }

    let rootId = doc.id;
    const seenBack = new Set();
    while (rootId && !seenBack.has(rootId)) {
      seenBack.add(rootId);
      const prev = rows.find((r) => r.id === rootId);
      if (!prev?.supersedes) break;
      rootId = prev.supersedes;
    }

    const chain = [];
    let currentId = rootId;
    const seenForward = new Set();
    while (currentId && !seenForward.has(currentId)) {
      seenForward.add(currentId);
      let item = rows.find((r) => r.id === currentId);
      if (!item) {
        const { data } = await supabase
          .from('document')
          .select('id, title, version, supersedes, created_at, is_active, status, file_name')
          .eq('company_id', companyId)
          .eq('id', currentId)
          .maybeSingle();
        item = data;
      }
      if (!item) break;
      chain.push(item);
      currentId = successorBySupersedes.get(currentId) ?? null;
    }
    setHistoryChain(chain);
  }

  function openEdit(doc) {
    setEditDoc(doc);
    setEditTitle(doc.title || doc.file_name);
    setEditFolderId(doc.folder_id || '');
    setEditActive(Boolean(doc.is_active));
  }

  async function saveEdit() {
    if (!editDoc || savingEdit) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/documents/${editDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          folderId: editFolderId || null,
          is_active: editActive,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEditDoc(null);
      fetchAll();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function saveMove() {
    if (!moveDoc) return;
    await moveDocumentToFolder(moveDoc.id, moveFolderId || null);
    setMoveDoc(null);
  }

  async function uploadOne(file, options = {}) {
    const form = new FormData();
    form.append('file', file);
    form.append('isRevision', options.isRevision ? 'true' : 'false');
    if (options.supersedesId) form.append('supersedesId', options.supersedesId);
    if (options.folderId) form.append('folderId', options.folderId);

    const res = await fetch('/api/documents/upload', { method: 'POST', body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || '업로드 실패');
    return json.document;
  }

  async function checkDuplicate(fileName) {
    const res = await fetch(`/api/documents/duplicate?fileName=${encodeURIComponent(fileName)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    return json.existing;
  }

  async function processUploadQueue(files, startIndex = 0, options = {}) {
    const folderId = selectedFolderId || '';
    for (let i = startIndex; i < files.length; i += 1) {
      const file = files[i];
      setUploadQueue((q) =>
        q.map((item) => (item.name === file.name ? { ...item, status: 'uploading' } : item))
      );
      try {
        const existing = await checkDuplicate(file.name);
        if (existing && !options.skipDuplicateCheck) {
          setRevisionPrompt({ file, existing, files, index: i, folderId });
          return;
        }
        await uploadOne(file, { isRevision: false, folderId });
        setUploadQueue((q) =>
          q.map((item) => (item.name === file.name ? { ...item, status: 'done' } : item))
        );
      } catch (err) {
        setUploadQueue((q) =>
          q.map((item) =>
            item.name === file.name ? { ...item, status: 'error', error: err.message } : item
          )
        );
      }
    }
    fetchAll();
  }

  function addUploadFiles(fileList) {
    const incoming = Array.from(fileList || []).filter(isAllowedFile);
    if (!incoming.length) return;
    setUploadQueue((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const merged = [...prev];
      for (const file of incoming) {
        if (!names.has(file.name)) {
          merged.push({ name: file.name, file, status: 'pending' });
        }
      }
      return merged;
    });
  }

  async function startUploads() {
    const pending = uploadQueue.filter((q) => q.status === 'pending' || q.status === 'error');
    if (!pending.length) return;
    await processUploadQueue(
      pending.map((p) => p.file),
      0
    );
  }

  async function handleRevisionChoice(isRevision) {
    if (!revisionPrompt) return;
    const { file, existing, files, index, folderId } = revisionPrompt;
    setRevisionPrompt(null);
    setUploadQueue((q) =>
      q.map((item) => (item.name === file.name ? { ...item, status: 'uploading' } : item))
    );
    try {
      await uploadOne(file, {
        isRevision,
        supersedesId: isRevision ? existing.id : undefined,
        folderId,
      });
      setUploadQueue((q) =>
        q.map((item) => (item.name === file.name ? { ...item, status: 'done' } : item))
      );
      await processUploadQueue(files, index + 1, { skipDuplicateCheck: true });
    } catch (err) {
      setUploadQueue((q) =>
        q.map((item) =>
          item.name === file.name ? { ...item, status: 'error', error: err.message } : item
        )
      );
    }
  }

  async function uploadRevision(file, doc) {
    if (!file) return;
    try {
      await uploadOne(file, { isRevision: true, supersedesId: doc.id, folderId: doc.folder_id || '' });
      fetchAll();
      setEditDoc(null);
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <div className="p-8 text-sm text-muted">데이터 불러오는 중...</div>;

  const unfolderedDrop = getDropTargetProps(null);
  const isAllDocsView = selectedFolderId == null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        eyebrow="KNOWLEDGE BASE"
        title="문서"
        description="폴더로 정리 · AI 검색은 회사 전체 문서 대상"
      />

      {error ? (
        <div className="mx-4 mt-4 rounded-xl border border-danger/30 bg-dangerSoft px-4 py-3 text-sm text-danger md:mx-8">
          {error}
          {error.includes('document_folder') ? (
            <p className="mt-2 text-xs">
              document_folder 마이그레이션(027)을 Supabase에 적용했는지 확인하세요.
            </p>
          ) : null}
        </div>
      ) : null}

      {moveError ? (
        <div className="mx-4 mt-4 rounded-xl border border-danger/30 bg-dangerSoft px-4 py-3 text-sm text-danger md:mx-8">
          {moveError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-8 pt-4 md:flex-row md:px-8">
        {/* 좌측 폴더 트리 */}
        <aside className="w-full shrink-0 rounded-xl border border-border bg-surface md:w-56">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-medium text-muted">폴더</span>
            <button
              type="button"
              className="rounded-lg p-1 text-muted hover:bg-surface2 hover:text-text"
              onClick={() => {
                setFolderDialog({ mode: 'create' });
                setFolderNameInput('');
              }}
              title="새 폴더"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-[320px] overflow-y-auto p-2 md:max-h-none">
            <button
              type="button"
              className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm ${
                isAllDocsView ? 'bg-accentSoft font-medium text-accent' : 'text-muted hover:bg-surface2'
              }`}
              onClick={() => {
                setSelectedFolderId(null);
                setFilters((f) => ({ ...f, showUnfolderedOnly: false }));
              }}
            >
              <Folder className="h-4 w-4" />
              전체 문서
            </button>
            {draggingDocId ? (
              <div
                className={`mb-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-2 py-2 text-xs text-muted ${unfolderedDrop.className}`}
                onDragOver={unfolderedDrop.onDragOver}
                onDragLeave={unfolderedDrop.onDragLeave}
                onDrop={unfolderedDrop.onDrop}
              >
                폴더 미지정으로 이동
              </div>
            ) : null}
            {renderFolderNodes('__root__', 0)}
          </div>
        </aside>

        {/* 우측 문서 목록 */}
        <div className="min-w-0 flex-1 space-y-4">
          <nav className="flex flex-wrap items-center gap-1 text-sm text-muted">
            <button
              type="button"
              className="px-1 hover:text-accent"
              onClick={() => {
                setSelectedFolderId(null);
                setFilters((f) => ({ ...f, showUnfolderedOnly: false }));
              }}
            >
              문서
            </button>
            {breadcrumb.map((f) => {
              const crumbDrop = getDropTargetProps(f.id);
              return (
                <span key={f.id} className="flex items-center gap-1">
                  <span>/</span>
                  <button
                    type="button"
                    className={`px-1 hover:text-accent ${crumbDrop.className}`}
                    onClick={() => setSelectedFolderId(f.id)}
                    onDragOver={crumbDrop.onDragOver}
                    onDragLeave={crumbDrop.onDragLeave}
                    onDrop={crumbDrop.onDrop}
                  >
                    {f.name}
                  </button>
                </span>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            {isAllDocsView ? (
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, showUnfolderedOnly: !f.showUnfolderedOnly }))}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  filters.showUnfolderedOnly
                    ? 'bg-accentSoft text-accent'
                    : 'bg-surface2 text-muted hover:text-text'
                } ${draggingDocId ? unfolderedDrop.className : ''}`}
                onDragOver={draggingDocId ? unfolderedDrop.onDragOver : undefined}
                onDragLeave={draggingDocId ? unfolderedDrop.onDragLeave : undefined}
                onDrop={draggingDocId ? unfolderedDrop.onDrop : undefined}
              >
                폴더 미지정 ({filterCounts.unfoldered})
              </button>
            ) : null}
            {[
              { key: 'showProcessing', label: `처리 중 (${filterCounts.processing})` },
              { key: 'showFailed', label: `실패 (${filterCounts.failed})` },
              { key: 'showInactive', label: `비활성 (${filterCounts.inactive})` },
              { key: 'showOldVersions', label: `구버전 (${filterCounts.oldVersions})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, [key]: !f[key] }))}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  filters[key]
                    ? 'bg-accentSoft text-accent'
                    : 'bg-surface2 text-muted hover:text-text'
                }`}
              >
                {label}
              </button>
            ))}
            {filterCounts.failed > 0 ? (
              <button type="button" onClick={bulkDeactivateFailed} className={btnSecondary}>
                실패 문서 정리
              </button>
            ) : null}
          </div>

          {/* 업로드 — 모달 없이 하단 패널, 다른 작업 가능 */}
          <div className="rounded-xl border border-dashed border-border bg-surface2/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-medium text-text">업로드</span>
                <span className="ml-2 text-xs text-muted">
                  업로드 위치:{' '}
                  {selectedFolderId
                    ? breadcrumb[breadcrumb.length - 1]?.name
                    : '폴더 미지정'}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  파일 선택
                </button>
                {uploadQueue.some((q) => q.status === 'pending' || q.status === 'error') ? (
                  <button type="button" className={btnPrimary} onClick={startUploads}>
                    업로드 시작
                  </button>
                ) : null}
              </div>
              <input
                ref={uploadInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={(e) => {
                  addUploadFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            {uploadQueue.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {uploadQueue.map((item) => (
                  <li key={item.name} className="flex items-center justify-between text-xs">
                    <span className="truncate text-text">{item.name}</span>
                    <span
                      className={
                        item.status === 'done'
                          ? 'text-good'
                          : item.status === 'error'
                            ? 'text-danger'
                            : item.status === 'uploading'
                              ? 'text-warn'
                              : 'text-muted'
                      }
                    >
                      {item.status === 'done'
                        ? '완료'
                        : item.status === 'error'
                          ? item.error || '실패'
                          : item.status === 'uploading'
                            ? '업로드 중…'
                            : '대기'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-surface2 text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">문서명</th>
                  <th className="px-4 py-3 font-medium">버전</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">조각</th>
                  <th className="px-4 py-3 font-medium">업로드</th>
                  <th className="px-4 py-3 font-medium">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {visibleDocs.map((doc) => {
                  const isOldVersion = supersededIds.has(doc.id);
                  return (
                  <tr
                    key={doc.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, doc.id)}
                    onDragEnd={handleDragEnd}
                    title={isOldVersion ? '이 문서는 검색에서 제외됩니다' : undefined}
                    className={`${
                      !doc.is_active || isOldVersion ? 'opacity-60' : ''
                    } ${draggingDocId === doc.id ? '!opacity-40' : ''} ${isOldVersion ? 'cursor-help' : ''}`.trim() || undefined}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-text">{doc.title || doc.file_name}</span>
                        {isOldVersion ? (
                          <span
                            title="이 문서는 검색에서 제외됩니다"
                            className="inline-flex cursor-help rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-medium text-muted"
                          >
                            구버전
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted">{doc.file_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <VersionBadge version={doc.version} isOldVersion={isOldVersion} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={doc.status} />
                      {doc.status === 'failed' && doc.error_message ? (
                        <div className="mt-1 max-w-xs text-xs text-danger">{doc.error_message}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{chunkCounts[doc.id] ?? '—'}</td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(doc.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Link href={`/documents/${doc.id}/chunks`} className={btnSecondary}>
                          조각
                        </Link>
                        <button type="button" className={btnSecondary} onClick={() => openEdit(doc)}>
                          <Pencil className="h-3.5 w-3.5" />
                          편집
                        </button>
                        <button
                          type="button"
                          className={btnSecondary}
                          onClick={() => {
                            setMoveDoc(doc);
                            setMoveFolderId(doc.folder_id || '');
                          }}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                          이동
                        </button>
                        <button type="button" className={btnSecondary} onClick={() => openHistory(doc)}>
                          <History className="h-3.5 w-3.5" />
                        </button>
                        {doc.status === 'failed' ? (
                          <button
                            type="button"
                            disabled={reprocessId === doc.id}
                            onClick={() => handleReprocess(doc.id)}
                            className={btnSecondary}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {visibleDocs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted">
                      표시할 문서가 없습니다. 필터를 켜거나 문서를 업로드하세요.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 문서 편집 */}
      {editDoc ? (
        <ModalShell
          title="문서 편집"
          onClose={() => !savingEdit && setEditDoc(null)}
          footer={
            <ModalFooterActions
              onCancel={() => setEditDoc(null)}
              onConfirm={saveEdit}
              confirmLabel={savingEdit ? '저장 중…' : '저장'}
              confirmDisabled={savingEdit}
            />
          }
        >
          <div className="space-y-4 px-4 py-4 md:px-6">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">표시 제목</label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-muted">파일명({editDoc.file_name})은 변경되지 않습니다.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">폴더</label>
              <select
                value={editFolderId}
                onChange={(e) => setEditFolderId(e.target.value)}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm"
              >
                <option value="">폴더 미지정</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {folderBreadcrumb(f.id, folders)
                      .map((x) => x.name)
                      .join(' / ')}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
              />
              AI 검색에 포함 (활성)
            </label>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">개정판 업로드</label>
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                className="text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadRevision(f, editDoc);
                  e.target.value = '';
                }}
              />
              <p className="mt-1 text-[11px] text-muted">
                같은 파일명 개정 시 이전 버전은 자동 비활성화됩니다.
              </p>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {/* 이동 — DnD와 함께 폴더 선택 메뉴 유지 (긴 목록·스크롤 시 편함) */}
      {moveDoc ? (
        <ModalShell title="폴더 이동" onClose={() => setMoveDoc(null)}>
          <div className="space-y-4 px-4 py-4 md:px-6">
            <p className="text-sm text-muted">{moveDoc.title || moveDoc.file_name}</p>
            <select
              value={moveFolderId}
              onChange={(e) => setMoveFolderId(e.target.value)}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            >
              <option value="">폴더 미지정</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {folderBreadcrumb(f.id, folders)
                    .map((x) => x.name)
                    .join(' / ')}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setMoveDoc(null)}>
                취소
              </button>
              <button type="button" className={btnPrimary} onClick={saveMove}>
                이동
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {folderDialog?.mode === 'delete' ? (
        <ConfirmDialog
          open
          title="폴더 삭제"
          message={`「${folderDialog.folder.name}」 폴더를 삭제합니다.\n안의 문서는 상위 폴더로 이동하며 삭제되지 않습니다.`}
          confirmLabel={folderSaving ? '처리 중…' : '삭제'}
          onConfirm={saveFolderDialog}
          onCancel={() => setFolderDialog(null)}
        />
      ) : null}

      {folderDialog && folderDialog.mode !== 'delete' ? (
        <ModalShell
          title={folderDialog.mode === 'create' ? '새 폴더' : '폴더 이름 변경'}
          onClose={() => setFolderDialog(null)}
          footer={
            <ModalFooterActions
              onCancel={() => setFolderDialog(null)}
              onConfirm={saveFolderDialog}
              confirmLabel={folderSaving ? '저장 중…' : '저장'}
              confirmDisabled={folderSaving || !folderNameInput.trim()}
            />
          }
        >
          <input
            value={folderNameInput}
            onChange={(e) => setFolderNameInput(e.target.value)}
            className="mx-4 mb-4 w-[calc(100%-2rem)] rounded-xl border border-border px-3 py-2 text-sm md:mx-6 md:w-[calc(100%-3rem)]"
            placeholder="폴더 이름"
          />
        </ModalShell>
      ) : null}

      {historyDoc ? (
        <ModalShell
          title="개정 이력"
          onClose={() => {
            setHistoryDoc(null);
            setHistoryChain([]);
          }}
        >
          <div className="mx-4 my-4 md:mx-6">
            {historyChain.length > 1 ? (
              <div className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted">
                {historyChain.map((item, index) => (
                  <span key={item.id} className="flex items-center gap-1">
                    {index > 0 ? <span className="text-muted">→</span> : null}
                    <span
                      className={`rounded-full px-2 py-0.5 font-medium ${
                        item.id === historyDoc.id
                          ? 'bg-accentSoft text-accent'
                          : index === historyChain.length - 1
                            ? 'bg-goodSoft text-good'
                            : 'bg-surface2 text-muted'
                      }`}
                    >
                      v{item.version || 1}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
            <ul className="divide-y divide-border rounded-xl border border-border">
              {historyChain.map((item, index) => {
                const isOld = index < historyChain.length - 1;
                const isCurrent = item.id === historyDoc.id;
                return (
                  <li
                    key={item.id}
                    className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${
                      isCurrent ? 'bg-accentSoft/30' : ''
                    }`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 font-medium text-text">
                        <span>{item.title || item.file_name}</span>
                        <VersionBadge version={item.version} isOldVersion={isOld} />
                        {index === historyChain.length - 1 ? (
                          <span className="text-[10px] font-normal text-good">최신</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted">{formatDateTime(item.created_at)}</div>
                      {isOld ? (
                        <p className="mt-1 text-[11px] text-muted">검색에서 제외됩니다</p>
                      ) : null}
                    </div>
                    <StatusBadge status={item.status} />
                  </li>
                );
              })}
            </ul>
          </div>
        </ModalShell>
      ) : null}

      <ConfirmDialog
        open={Boolean(revisionPrompt)}
        title="개정판 확인"
        message={
          revisionPrompt
            ? `같은 이름의 활성 문서가 있습니다.\n「${revisionPrompt.existing.title || revisionPrompt.existing.file_name}」(v${revisionPrompt.existing.version})의 개정판인가요?`
            : ''
        }
        confirmLabel="개정판입니다"
        cancelLabel="별개 문서입니다"
        onConfirm={() => handleRevisionChoice(true)}
        onCancel={() => handleRevisionChoice(false)}
      />
    </div>
  );
}
