'use client';

import { useCallback, useRef, useState } from 'react';
import {
  clampBounds,
  isCircleMarker,
  markerBounds,
  markerToNormalizedBounds,
  normalizedBoundsToMarker,
  resolveCoordinateDimensions,
  screenToNormalizedInContain,
} from '../lib/markingData';

const MIN_SIZE = 0.02;
const HANDLE_CLASS =
  'absolute z-20 h-3 w-3 rounded-sm border-2 border-danger bg-surface shadow-sm touch-none';

function EditableShape({
  marker,
  index,
  coordWidth,
  coordHeight,
  mode,
  imageAspect,
  containerRef,
  onUpdate,
}) {
  const bounds = markerBounds(marker, coordWidth, coordHeight);
  if (!bounds) return null;

  const isCircle = isCircleMarker(marker);
  const [dragging, setDragging] = useState(null);

  const finishDrag = useCallback(() => setDragging(null), []);

  const handlePointerDown = useCallback(
    (e, dragMode) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);

      const container = containerRef.current?.getBoundingClientRect();
      if (!container) return;

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
      if (!container) return;

      const pointerNorm = screenToNormalizedInContain(
        e.clientX,
        e.clientY,
        container,
        imageAspect
      );
      const { startBounds, startPointer, mode: dragMode } = dragging;
      let next = { ...startBounds };

      if (dragMode === 'move') {
        const dx = pointerNorm.x - startPointer.x;
        const dy = pointerNorm.y - startPointer.y;
        next = clampBounds({
          left: startBounds.left + dx,
          top: startBounds.top + dy,
          width: startBounds.width,
          height: startBounds.height,
        }, MIN_SIZE);
      } else if (dragMode === 'resize') {
        if (isCircle) {
          const cx = startBounds.left + startBounds.width / 2;
          const cy = startBounds.top + startBounds.height / 2;
          const halfW = Math.max(
            MIN_SIZE / 2,
            Math.abs(pointerNorm.x - cx)
          );
          const halfH = Math.max(
            MIN_SIZE / 2,
            Math.abs(pointerNorm.y - cy)
          );
          const half = Math.max(halfW, halfH);
          next = clampBounds({
            left: cx - half,
            top: cy - half,
            width: half * 2,
            height: half * 2,
          }, MIN_SIZE);
        } else {
          next = clampBounds({
            left: startBounds.left,
            top: startBounds.top,
            width: Math.max(MIN_SIZE, pointerNorm.x - startBounds.left),
            height: Math.max(MIN_SIZE, pointerNorm.y - startBounds.top),
          }, MIN_SIZE);
        }
      }

      onUpdate(
        index - 1,
        normalizedBoundsToMarker(marker, next, coordWidth, coordHeight, mode)
      );
    },
    [dragging, containerRef, imageAspect, marker, index, coordWidth, coordHeight, mode, onUpdate, isCircle]
  );

  return (
    <div
      className={`absolute touch-none select-none ${isCircle ? 'rounded-full' : 'rounded-md'} border-2 border-danger bg-danger/25 cursor-move`}
      style={{
        left: `${bounds.left}%`,
        top: `${bounds.top}%`,
        width: `${bounds.width}%`,
        height: `${bounds.height}%`,
      }}
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <span className="pointer-events-none absolute -top-0.5 -left-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[10px] text-white shadow-sm">
        {index}
      </span>
      <div
        className={`${HANDLE_CLASS} ${isCircle ? '-right-1.5 top-1/2 -translate-y-1/2' : '-bottom-1.5 -right-1.5'} cursor-se-resize`}
        onPointerDown={(e) => handlePointerDown(e, 'resize')}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      />
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
  if (!markers.length) return null;

  const { width: coordWidth, height: coordHeight, mode } = resolveCoordinateDimensions(
    markers,
    imageWidth,
    imageHeight
  );
  const imageAspect =
    imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : coordWidth / coordHeight;

  const handleUpdate = useCallback(
    (idx, updated) => {
      onChange(markers.map((m, i) => (i === idx ? updated : m)));
    },
    [markers, onChange]
  );

  return (
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
          containerRef={containerRef}
          onUpdate={handleUpdate}
        />
      ))}
    </div>
  );
}
