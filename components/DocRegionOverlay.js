'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DOC_ERROR_CODES } from '../lib/constants';
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

const MIN_SIZE = 0.02;
const DOC_CODE_ENTRIES = Object.entries(DOC_ERROR_CODES);
const DEFAULT_DOC_CODE = DOC_CODE_ENTRIES[0]?.[0] ?? 'DOC-001';

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

function CodePopover({ title, code, onCodeChange, onConfirm, onCancel, onDelete, confirmLabel = '확인' }) {
  return (
    <div
      className="absolute z-50 w-56 rounded-xl border border-border bg-surface p-3 shadow-card"
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={title}
    >
      <div className="mb-2 text-xs font-medium text-text">{title}</div>
      <select value={code} onChange={(e) => onCodeChange(e.target.value)} className={selectClass}>
        {DOC_CODE_ENTRIES.map(([value, label]) => (
          <option key={value} value={value}>
            {label} ({value})
          </option>
        ))}
      </select>
      <div className="mt-2 flex items-center gap-1.5">
        {onConfirm ? (
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            {confirmLabel}
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg bg-dangerSoft px-2 py-1.5 text-xs font-medium text-danger hover:opacity-90"
            title="삭제"
          >
            삭제
          </button>
        ) : null}
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-2 py-1.5 text-xs text-muted hover:bg-surface2 hover:text-text"
          >
            취소
          </button>
        ) : null}
      </div>
    </div>
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
  onChangeCode,
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
        onSelect(index - 1);
      }
    },
    [finishDrag, onSelect, index]
  );

  const codeLabel = marker.code ? DOC_ERROR_CODES[marker.code] || marker.code : null;

  return (
    <>
      <div
        className={`pointer-events-auto absolute z-10 touch-none select-none rounded-md border-2 cursor-move ${
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
      >
        <span className="pointer-events-none absolute -top-0.5 -left-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] text-white shadow-sm">
          {index}
        </span>
        {codeLabel ? (
          <span className="pointer-events-none absolute bottom-0.5 left-0.5 max-w-[90%] truncate rounded bg-surface/90 px-1 text-[9px] font-medium text-danger">
            {codeLabel}
          </span>
        ) : null}

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

      {selected ? (
        <div
          className="pointer-events-auto absolute z-50"
          style={{
            left: `${Math.min(bounds.left + bounds.width, 72)}%`,
            top: `${Math.max(0, bounds.top)}%`,
          }}
        >
          <CodePopover
            title={`영역 ${index} 오류`}
            code={marker.code || DEFAULT_DOC_CODE}
            onCodeChange={(code) => onChangeCode(index - 1, code)}
            onDelete={() => onDelete(index - 1)}
            onCancel={() => onSelect(null)}
            confirmLabel="닫기"
            onConfirm={() => onSelect(null)}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * 문서 오류 영역 지정 — 불량기록 EditableMarkerOverlay와 동일 contain 좌표 파이프라인
 * drawMode ON: 드래그로 새 rect 생성 → 오류코드 팝오버
 */
export default function DocRegionOverlay({
  markers,
  imageWidth,
  imageHeight,
  containerRef,
  onChange,
  drawMode = false,
}) {
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState(null);
  const [pending, setPending] = useState(null);
  const [pendingCode, setPendingCode] = useState(DEFAULT_DOC_CODE);
  const [selectedIdx, setSelectedIdx] = useState(null);

  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return undefined;

    const sync = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    };
    sync();

    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [containerRef]);

  useEffect(() => {
    if (!drawMode) {
      setDraft(null);
    } else {
      setSelectedIdx(null);
    }
  }, [drawMode]);

  const { width: coordWidth, height: coordHeight, mode } = resolveCoordinateDimensions(
    markers,
    imageWidth,
    imageHeight
  );
  const imageAspect =
    imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 3 / 4;

  const containLayout =
    containerSize.w > 0 && containerSize.h > 0
      ? getContainLayout(containerSize.w, containerSize.h, imageAspect)
      : null;

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
      onChange((prev) => {
        const list = Array.isArray(prev) ? prev : markers;
        return list.filter((_, i) => i !== idx);
      });
      setSelectedIdx(null);
    },
    [markers, onChange]
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

      setPendingCode(DEFAULT_DOC_CODE);
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
      code: pendingCode || DEFAULT_DOC_CODE,
    };
    onChange((prev) => {
      const list = Array.isArray(prev) ? prev : markers;
      return [...list, marker];
    });
    setPending(null);
  }, [pending, pendingCode, markers, onChange]);

  const cancelPending = useCallback(() => setPending(null), []);

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
          key={`doc-region-${i}`}
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
          onSelect={setSelectedIdx}
          onUpdate={handleUpdate}
          onChangeCode={handleChangeCode}
          onDelete={handleDelete}
        />
      ))}

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
        <>
          <div
            className="pointer-events-none absolute rounded-md border-2 border-accent bg-accent/20"
            style={{
              left: `${pendingDisplay.left}%`,
              top: `${pendingDisplay.top}%`,
              width: `${pendingDisplay.width}%`,
              height: `${pendingDisplay.height}%`,
            }}
          />
          <div
            className="pointer-events-auto absolute z-50"
            style={{
              left: `${Math.min(pendingDisplay.left + pendingDisplay.width, 70)}%`,
              top: `${Math.max(0, pendingDisplay.top)}%`,
            }}
          >
            <CodePopover
              title="오류 유형 선택"
              code={pendingCode}
              onCodeChange={setPendingCode}
              onConfirm={confirmPending}
              onCancel={cancelPending}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
