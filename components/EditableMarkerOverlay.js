'use client';

import { useCallback, useRef, useState } from 'react';
import { useUndoableMarkerDelete } from '../hooks/useUndoableMarkerDelete';
import { useContainContainerSize } from '../hooks/useContainContainerSize';
import {
  computeMarkerDragBounds,
  containBoundsFromLayout,
  getContainLayout,
  isCircleMarker,
  markerBounds,
  markerToNormalizedBounds,
  normalizedBoundsToMarker,
  resolveCoordinateDimensions,
  screenToNormalizedInContain,
} from '../lib/markingData';
import RegionDeleteButton from './RegionDeleteButton';
import UndoToast from './UndoToast';

const MIN_SIZE = 0.02;
const HANDLE_CLASS =
  'absolute z-20 h-3.5 w-3.5 rounded-sm border-2 border-danger bg-surface shadow-sm touch-none';

const RECT_HANDLES = [
  { mode: 'resize-nw', className: '-left-1.5 -top-1.5 cursor-nw-resize' },
  { mode: 'resize-ne', className: '-right-1.5 -top-1.5 cursor-ne-resize' },
  { mode: 'resize-sw', className: '-left-1.5 -bottom-1.5 cursor-sw-resize' },
  { mode: 'resize-se', className: '-right-1.5 -bottom-1.5 cursor-se-resize' },
];

function EditableShape({
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
  const isCircle = isCircleMarker(marker);
  const [dragging, setDragging] = useState(null);
  const [hovered, setHovered] = useState(false);
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

      onUpdate(
        index - 1,
        normalizedBoundsToMarker(marker, next, coordWidth, coordHeight, mode)
      );
    },
    [dragging, containerRef, imageAspect, marker, index, coordWidth, coordHeight, mode, onUpdate]
  );

  const handlePointerUp = useCallback(
    (e) => {
      finishDrag(e);
      if (!movedRef.current && e.button !== 2) {
        onSelect?.(index - 1);
      }
    },
    [finishDrag, onSelect, index]
  );

  return (
    <div
      className={`absolute touch-none select-none border-2 cursor-move ${
        isCircle ? 'rounded-full' : 'rounded-md'
      } ${
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
      <span className="pointer-events-none absolute -top-0.5 -left-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[10px] text-white shadow-sm">
        {index}
      </span>

      <RegionDeleteButton
        visible={selected || hovered}
        onDelete={() => onDelete?.(index - 1)}
      />

      {isCircle ? (
        <div
          className={`${HANDLE_CLASS} -right-1.5 top-1/2 -translate-y-1/2 cursor-e-resize`}
          onPointerDown={(e) => handlePointerDown(e, 'resize-circle')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={finishDrag}
        />
      ) : (
        RECT_HANDLES.map((h) => (
          <div
            key={h.mode}
            className={`${HANDLE_CLASS} ${h.className}`}
            onPointerDown={(e) => handlePointerDown(e, h.mode)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={finishDrag}
          />
        ))
      )}
    </div>
  );
}

export default function EditableMarkerOverlay({
  markers,
  imageWidth,
  imageHeight,
  containerRef,
  onChange,
}) {
  const containerSize = useContainContainerSize(containerRef);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const { deleteAt, undoDelete, dismissUndo, undoOpen } = useUndoableMarkerDelete(
    markers,
    onChange
  );

  const { width: coordWidth, height: coordHeight, mode } = resolveCoordinateDimensions(
    markers,
    imageWidth,
    imageHeight
  );
  const imageAspect =
    imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : coordWidth / (coordHeight || 1);

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

  const handleDelete = useCallback(
    (idx) => {
      deleteAt(idx);
      setSelectedIdx(null);
    },
    [deleteAt]
  );

  const handleSelect = useCallback((idx) => {
    setSelectedIdx(idx);
  }, []);

  return (
    <>
      {markers.length > 0 ? (
        <div className="absolute inset-0 z-10 overflow-hidden">
          {markers.map((marker, i) => (
            <EditableShape
              key={`edit-${i}`}
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
              selected={selectedIdx === i}
              onSelect={handleSelect}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : null}
      <UndoToast open={undoOpen} onUndo={undoDelete} onDismiss={dismissUndo} />
    </>
  );
}
