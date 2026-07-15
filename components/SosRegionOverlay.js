'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SOS_ERROR_CATEGORIES,
  SOS_ERROR_CODES,
  getSosCategoryForCode,
} from '../lib/constants';
import { requestClassifyPhoto, AI_UNAVAILABLE_MESSAGE } from '../lib/classifyClient';
import { cropImageRegionToDataUrl } from '../lib/cropImageRegion';
import {
  clampBounds,
  computeMarkerDragBounds,
  containBoundsFromLayout,
  getContainLayout,
  markerBounds,
  markerToNormalizedBounds,
  normalizedBoundsToMarker,
  resolveCoordinateDimensions,
  screenToNormalizedInContain,
} from '../lib/markingData';
import { useUndoableMarkerDelete } from '../hooks/useUndoableMarkerDelete';
import { useContainContainerSize } from '../hooks/useContainContainerSize';
import AiSuggestionBanner from './AiSuggestionBanner';
import FloatingPortalPopover from './FloatingPortalPopover';
import RegionDeleteButton from './RegionDeleteButton';
import UndoToast from './UndoToast';

const MIN_SIZE = 0.02;
const SOS_CATEGORIES = Object.keys(SOS_ERROR_CATEGORIES);
const DEFAULT_SOS_CODE = SOS_ERROR_CATEGORIES[SOS_CATEGORIES[0]]?.[0] ?? 'OS01';

const HANDLE_CLASS =
  'absolute z-20 h-3.5 w-3.5 rounded-sm border-2 border-danger bg-surface shadow-sm touch-none';

const RECT_HANDLES = [
  { mode: 'resize-nw', className: '-left-1.5 -top-1.5 cursor-nw-resize' },
  { mode: 'resize-ne', className: '-right-1.5 -top-1.5 cursor-ne-resize' },
  { mode: 'resize-sw', className: '-left-1.5 -bottom-1.5 cursor-sw-resize' },
  { mode: 'resize-se', className: '-right-1.5 -bottom-1.5 cursor-se-resize' },
];

const selectClass =
  'w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';

function boundsFromDrag(a, b) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  return clampBounds({
    left,
    top,
    width: right - left,
    height: bottom - top,
  });
}

function SosCodePopover({
  anchor,
  title,
  code,
  onCodeChange,
  onConfirm,
  onCancel,
  onDelete,
  confirmLabel = '확인',
  onAiClassify,
  aiClassifying,
  aiSuggestion,
  aiError,
}) {
  const category = getSosCategoryForCode(code);
  const codesInCategory = SOS_ERROR_CATEGORIES[category] || [];

  function handleCategoryChange(nextCat) {
    const nextCodes = SOS_ERROR_CATEGORIES[nextCat] || [];
    const nextCode = nextCodes.includes(code) ? code : nextCodes[0] || DEFAULT_SOS_CODE;
    onCodeChange(nextCode);
  }

  if (!anchor) return null;

  return (
    <FloatingPortalPopover
      anchor={anchor}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-card"
      role="dialog"
      aria-label={title}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3">
        <div className="mb-2 text-xs font-medium text-text">{title}</div>
        <label className="mb-1 block text-[10px] text-muted">카테고리</label>
        <select
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className={selectClass}
          disabled={aiClassifying}
        >
          {SOS_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <label className="mb-1 mt-2 block text-[10px] text-muted">오류 코드</label>
        <select
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          className={selectClass}
          disabled={aiClassifying}
        >
          {codesInCategory.map((value) => (
            <option key={value} value={value}>
              {SOS_ERROR_CODES[value]} ({value})
            </option>
          ))}
        </select>

        {onAiClassify ? (
          <button
            type="button"
            onClick={onAiClassify}
            disabled={aiClassifying}
            className="mt-2 w-full rounded-lg border border-accent/30 bg-accentSoft px-2 py-1.5 text-xs font-medium text-accent transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {aiClassifying ? 'AI 분석 중...' : 'AI 자동판정'}
          </button>
        ) : null}

        {aiError ? (
          <div className="mt-2 rounded-lg bg-dangerSoft px-2 py-1.5 text-[11px] text-danger">
            {aiError}
          </div>
        ) : null}

        {aiSuggestion ? (
          <div className="mt-2">
            <AiSuggestionBanner
              code={aiSuggestion.code}
              confidence={aiSuggestion.confidence}
              reason={aiSuggestion.reason}
              codeSet="sos"
            />
          </div>
        ) : null}

        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={aiClassifying}
            className="mb-1 mt-3 w-full rounded-lg bg-dangerSoft px-2 py-1.5 text-xs font-medium text-danger hover:opacity-90 disabled:opacity-50"
          >
            이 영역 삭제
          </button>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-t border-border/70 bg-surface px-3 py-2.5">
        {onConfirm ? (
          <button
            type="button"
            onClick={onConfirm}
            disabled={aiClassifying}
            className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        ) : null}
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={aiClassifying}
            className="rounded-lg border border-border px-2 py-1.5 text-xs text-muted hover:bg-surface2 hover:text-text disabled:opacity-50"
          >
            취소
          </button>
        ) : null}
      </div>
    </FloatingPortalPopover>
  );
}

function RegionShape({
  marker,
  index,
  coordWidth,
  coordHeight,
  mode,
  imageAspect,
  containLayout,
  containerWidth,
  containerHeight,
  containerRef,
  selected,
  onSelect,
  onUpdate,
  onDelete,
}) {
  const imageBounds = markerBounds(marker, coordWidth, coordHeight);
  if (!imageBounds) return null;

  const bounds =
    containLayout && containerWidth > 0 && containerHeight > 0
      ? containBoundsFromLayout(imageBounds, containLayout, containerWidth, containerHeight) ||
        imageBounds
      : imageBounds;

  const [dragging, setDragging] = useState(null);
  const movedRef = useRef(false);

  const finishDrag = useCallback((e) => {
    if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(null);
  }, []);

  const handlePointerDown = useCallback(
    (e, dragMode) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      movedRef.current = false;

      const container = containerRef.current?.getBoundingClientRect();
      if (!container || container.width <= 0 || container.height <= 0) return;

      const norm = markerToNormalizedBounds(marker, coordWidth, coordHeight);
      if (!norm) return;

      const pointerNorm = screenToNormalizedInContain(
        e.clientX,
        e.clientY,
        container,
        imageAspect
      );

      setDragging({
        mode: dragMode,
        pointerId: e.pointerId,
        startPointer: pointerNorm,
        startBounds: { ...norm },
      });
    },
    [marker, coordWidth, coordHeight, imageAspect, containerRef]
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (!dragging || e.pointerId !== dragging.pointerId) return;

      const container = containerRef.current?.getBoundingClientRect();
      if (!container || container.width <= 0 || container.height <= 0) return;

      const pointerNorm = screenToNormalizedInContain(
        e.clientX,
        e.clientY,
        container,
        imageAspect
      );

      const dx = Math.abs(pointerNorm.x - dragging.startPointer.x);
      const dy = Math.abs(pointerNorm.y - dragging.startPointer.y);
      if (dx > 0.004 || dy > 0.004) movedRef.current = true;

      const next = computeMarkerDragBounds(
        dragging.mode,
        dragging.startBounds,
        dragging.startPointer,
        pointerNorm,
        MIN_SIZE
      );

      onUpdate(index - 1, normalizedBoundsToMarker(marker, next, coordWidth, coordHeight, mode));
    },
    [dragging, containerRef, imageAspect, marker, index, coordWidth, coordHeight, mode, onUpdate]
  );

  const handlePointerUp = useCallback(
    (e) => {
      finishDrag(e);
      if (!movedRef.current && e.button !== 2) {
        onSelect(index - 1, { x: e.clientX, y: e.clientY });
      }
    },
    [finishDrag, onSelect, index]
  );

  const codeLabel = marker.code ? SOS_ERROR_CODES[marker.code] || marker.code : null;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={`group pointer-events-auto absolute z-10 touch-none select-none rounded-md border-2 cursor-move ${
        selected
          ? 'border-accent bg-accent/20 ring-2 ring-accent/30'
          : 'border-danger bg-danger/25'
      }`}
      style={{
        left: `${bounds.left}%`,
        top: `${bounds.top}%`,
        width: `${bounds.width}%`,
        height: `${bounds.height}%`,
      }}
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={finishDrag}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <span className="pointer-events-none absolute -top-0.5 -left-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] text-white shadow-sm">
        {index}
      </span>
      {codeLabel ? (
        <span className="pointer-events-none absolute bottom-0.5 left-0.5 max-w-[90%] truncate rounded bg-surface/90 px-1 text-[9px] font-medium text-danger">
          {codeLabel}
        </span>
      ) : null}

      <RegionDeleteButton
        visible={selected || hovered}
        onDelete={() => onDelete?.(index - 1)}
      />

      {RECT_HANDLES.map((h) => (
        <div
          key={h.mode}
          className={`${HANDLE_CLASS} ${h.className}`}
          onPointerDown={(e) => handlePointerDown(e, h.mode)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={finishDrag}
        />
      ))}
    </div>
  );
}

/**
 * 3정5S 오류 영역 지정 — DocRegionOverlay와 동일 contain 파이프라인
 * 팝오버: 카테고리 → SOS 코드 2단계 + 영역 crop AI 판정(codeSet:sos)
 */
export default function SosRegionOverlay({
  markers,
  imageWidth,
  imageHeight,
  imageUrl,
  containerRef,
  onChange,
  drawMode = false,
}) {
  const containerSize = useContainContainerSize(containerRef);
  const [draft, setDraft] = useState(null);
  const [pending, setPending] = useState(null);
  const [pendingCode, setPendingCode] = useState(DEFAULT_SOS_CODE);
  const [pendingNote, setPendingNote] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  /** 뷰포트 client 좌표 — Portal 팝오버 fixed 앵커 */
  const [popoverAnchor, setPopoverAnchor] = useState(null);
  const [aiClassifying, setAiClassifying] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [aiTarget, setAiTarget] = useState(null);
  const { deleteAt, undoDelete, dismissUndo, undoOpen } = useUndoableMarkerDelete(
    markers,
    onChange
  );

  useEffect(() => {
    if (!drawMode) {
      setDraft(null);
    } else {
      setSelectedIdx(null);
      setPopoverAnchor(null);
      setAiSuggestion(null);
      setAiError(null);
      setAiTarget(null);
    }
  }, [drawMode]);

  const { width: coordWidth, height: coordHeight, mode } = resolveCoordinateDimensions(
    markers,
    imageWidth,
    imageHeight
  );
  const imageAspect =
    imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 4 / 3;

  const containLayout =
    containerSize.w > 0 && containerSize.h > 0
      ? getContainLayout(containerSize.w, containerSize.h, imageAspect)
      : null;

  const classifyRegion = useCallback(
    async (bounds, target) => {
      if (!imageUrl || !bounds) {
        setAiError('분석할 이미지가 없습니다.');
        return;
      }

      setAiClassifying(true);
      setAiError(null);
      setAiSuggestion(null);
      setAiTarget(target);

      try {
        const dataUrl = await cropImageRegionToDataUrl(imageUrl, bounds);
        const result = await requestClassifyPhoto(dataUrl, 'sos', { regionCrop: true });
        setAiSuggestion(result);

        if (result.code && SOS_ERROR_CODES[result.code]) {
          if (target === 'pending') {
            setPendingCode(result.code);
            setPendingNote(result.reason || null);
          } else if (typeof target === 'number') {
            onChange((prev) => {
              const list = Array.isArray(prev) ? prev : markers;
              return list.map((m, i) =>
                i === target
                  ? {
                      ...m,
                      code: result.code,
                      note: result.reason || m.note || null,
                    }
                  : m
              );
            });
          }
        }
      } catch (err) {
        setAiError(err.message || AI_UNAVAILABLE_MESSAGE);
      } finally {
        setAiClassifying(false);
      }
    },
    [imageUrl, markers, onChange]
  );

  const handleUpdate = useCallback(
    (idx, updated) => {
      onChange((prev) => {
        const list = Array.isArray(prev) ? prev : markers;
        return list.map((m, i) => (i === idx ? { ...updated } : m));
      });
    },
    [markers, onChange]
  );

  const handleChangeCode = useCallback(
    (idx, code) => {
      onChange((prev) => {
        const list = Array.isArray(prev) ? prev : markers;
        return list.map((m, i) => (i === idx ? { ...m, code } : m));
      });
    },
    [markers, onChange]
  );

  const handleDelete = useCallback(
    (idx) => {
      deleteAt(idx);
      setSelectedIdx(null);
      setPopoverAnchor(null);
      setAiSuggestion(null);
      setAiError(null);
      setAiTarget(null);
    },
    [deleteAt]
  );

  const startDraw = useCallback(
    (e) => {
      if (!drawMode || pending) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      const container = containerRef.current?.getBoundingClientRect();
      if (!container || container.width <= 0 || container.height <= 0) return;

      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      const start = screenToNormalizedInContain(e.clientX, e.clientY, container, imageAspect);
      setDraft({ pointerId: e.pointerId, start, current: start });
      setSelectedIdx(null);
      setPopoverAnchor(null);
    },
    [drawMode, pending, containerRef, imageAspect]
  );

  const moveDraw = useCallback(
    (e) => {
      if (!draft || e.pointerId !== draft.pointerId) return;
      const container = containerRef.current?.getBoundingClientRect();
      if (!container) return;
      const current = screenToNormalizedInContain(e.clientX, e.clientY, container, imageAspect);
      setDraft((d) => (d ? { ...d, current } : null));
    },
    [draft, containerRef, imageAspect]
  );

  const endDraw = useCallback(
    (e) => {
      if (!draft || e.pointerId !== draft.pointerId) return;
      if (e.currentTarget?.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      const bounds = boundsFromDrag(draft.start, draft.current);
      setDraft(null);

      if (bounds.width < MIN_SIZE || bounds.height < MIN_SIZE) return;

      setPendingCode(DEFAULT_SOS_CODE);
      setPendingNote(null);
      setAiSuggestion(null);
      setAiError(null);
      setAiTarget(null);
      setPopoverAnchor({ x: e.clientX, y: e.clientY });
      setPending(bounds);
    },
    [draft]
  );

  const confirmPending = useCallback(() => {
    if (!pending) return;
    const marker = {
      type: 'rect',
      ratio: true,
      x: pending.left,
      y: pending.top,
      width: pending.width,
      height: pending.height,
      code: pendingCode || DEFAULT_SOS_CODE,
    };
    if (pendingNote) marker.note = pendingNote;
    onChange((prev) => {
      const list = Array.isArray(prev) ? prev : markers;
      return [...list, marker];
    });
    setPending(null);
    setPendingNote(null);
    setPopoverAnchor(null);
    setAiSuggestion(null);
    setAiError(null);
    setAiTarget(null);
  }, [pending, pendingCode, pendingNote, markers, onChange]);

  const cancelPending = useCallback(() => {
    setPending(null);
    setPendingNote(null);
    setPopoverAnchor(null);
    setAiSuggestion(null);
    setAiError(null);
    setAiTarget(null);
  }, []);

  const handleSelect = useCallback((idx, anchor) => {
    setSelectedIdx(idx);
    setPopoverAnchor(anchor || null);
    setAiSuggestion(null);
    setAiError(null);
    setAiTarget(null);
  }, []);

  const closeSelected = useCallback(() => {
    setSelectedIdx(null);
    setPopoverAnchor(null);
    setAiSuggestion(null);
    setAiError(null);
    setAiTarget(null);
  }, []);

  const draftNorm = draft ? boundsFromDrag(draft.start, draft.current) : null;
  const draftDisplay =
    draftNorm && containLayout && containerSize.w > 0
      ? containBoundsFromLayout(
          {
            left: draftNorm.left * 100,
            top: draftNorm.top * 100,
            width: draftNorm.width * 100,
            height: draftNorm.height * 100,
          },
          containLayout,
          containerSize.w,
          containerSize.h
        )
      : null;

  const pendingDisplay =
    pending && containLayout && containerSize.w > 0
      ? containBoundsFromLayout(
          {
            left: pending.left * 100,
            top: pending.top * 100,
            width: pending.width * 100,
            height: pending.height * 100,
          },
          containLayout,
          containerSize.w,
          containerSize.h
        )
      : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {drawMode && !pending ? (
        <div
          className="pointer-events-auto absolute inset-0 z-0 cursor-crosshair"
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerCancel={endDraw}
        />
      ) : null}

      {markers.map((marker, i) => (
        <RegionShape
          key={`sos-region-${i}`}
          marker={marker}
          index={i + 1}
          coordWidth={coordWidth}
          coordHeight={coordHeight}
          mode={mode}
          imageAspect={imageAspect}
          containLayout={containLayout}
          containerWidth={containerSize.w}
          containerHeight={containerSize.h}
          containerRef={containerRef}
          selected={selectedIdx === i && !pending}
          onSelect={handleSelect}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      ))}

      <UndoToast open={undoOpen} onUndo={undoDelete} onDismiss={dismissUndo} />

      {draftDisplay ? (
        <div
          className="pointer-events-none absolute rounded-md border-2 border-dashed border-accent bg-accent/15"
          style={{
            left: `${draftDisplay.left}%`,
            top: `${draftDisplay.top}%`,
            width: `${draftDisplay.width}%`,
            height: `${draftDisplay.height}%`,
          }}
        />
      ) : null}

      {pendingDisplay ? (
        <div
          className="pointer-events-none absolute rounded-md border-2 border-accent bg-accent/20"
          style={{
            left: `${pendingDisplay.left}%`,
            top: `${pendingDisplay.top}%`,
            width: `${pendingDisplay.width}%`,
            height: `${pendingDisplay.height}%`,
          }}
        />
      ) : null}

      {pending && popoverAnchor ? (
        <SosCodePopover
          anchor={popoverAnchor}
          title="오류 유형 선택"
          code={pendingCode}
          onCodeChange={setPendingCode}
          onConfirm={confirmPending}
          onCancel={cancelPending}
          onAiClassify={
            imageUrl && pending ? () => classifyRegion(pending, 'pending') : undefined
          }
          aiClassifying={aiClassifying && aiTarget === 'pending'}
          aiSuggestion={aiTarget === 'pending' ? aiSuggestion : null}
          aiError={aiTarget === 'pending' ? aiError : null}
        />
      ) : null}

      {selectedIdx != null && !pending && popoverAnchor && markers[selectedIdx] ? (
        <SosCodePopover
          anchor={popoverAnchor}
          title={`영역 ${selectedIdx + 1} 오류`}
          code={markers[selectedIdx].code || DEFAULT_SOS_CODE}
          onCodeChange={(code) => handleChangeCode(selectedIdx, code)}
          onDelete={() => handleDelete(selectedIdx)}
          onCancel={closeSelected}
          confirmLabel="닫기"
          onConfirm={closeSelected}
          onAiClassify={
            imageUrl
              ? () => {
                  const norm = markerToNormalizedBounds(
                    markers[selectedIdx],
                    coordWidth,
                    coordHeight
                  );
                  if (norm) classifyRegion(norm, selectedIdx);
                }
              : undefined
          }
          aiClassifying={aiClassifying && aiTarget === selectedIdx}
          aiSuggestion={aiTarget === selectedIdx ? aiSuggestion : null}
          aiError={aiTarget === selectedIdx ? aiError : null}
        />
      ) : null}
    </div>
  );
}
