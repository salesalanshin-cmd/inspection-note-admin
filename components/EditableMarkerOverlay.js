'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  computeMarkerDragBounds,
  containBounds,
  isCircleMarker,
  markerBounds,
  markerToNormalizedBounds,
  normalizedBoundsToMarker,
  resolveCoordinateDimensions,
  screenToNormalizedInContain,
} from '../lib/markingData';

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
  containerAspect,
  containerRef,
  onUpdate,
}) {
  const imageBounds = markerBounds(marker, coordWidth, coordHeight);
  if (!imageBounds) return null;

  // 표시: 이미지 정규화 bounds → 컨테이너 % (object-contain 레터박스 반영)
  const bounds =
    containBounds(imageBounds, imageAspect, containerAspect) || imageBounds;
  const isCircle = isCircleMarker(marker);
  const [dragging, setDragging] = useState(null);

  const finishDrag = useCallback((e) => {
    if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDragging(null);
  }, []);

  /**
   * pointerdown / pointermove — 이동·리사이즈 모두 동일 파이프라인:
   * 1) getBoundingClientRect()로 컨테이너 측정
   * 2) screenToNormalizedInContain (contain 레터박스 보정)
   * 3) computeMarkerDragBounds (반대 모서리 고정 / move / circle)
   */
  const handlePointerDown = useCallback(
    (e, dragMode) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);

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

      // 이동과 리사이즈가 동일한 contain 보정 좌표 변환을 공유
      const pointerNorm = screenToNormalizedInContain(
        e.clientX,
        e.clientY,
        container,
        imageAspect
      );

      const next = computeMarkerDragBounds(
        dragging.mode,
        dragging.startBounds,
        dragging.startPointer,
        pointerNorm,
        MIN_SIZE
      );

      // --- RESIZE DEBUG ONLY (임시: 원인 확인용, 동작 수정 없음) ---
      if (dragging.mode !== 'move') {
        const start = dragging.startBounds;
        const right = start.left + start.width;
        const bottom = start.top + start.height;
        let fixedCorner = null;
        if (dragging.mode === 'resize-se') {
          fixedCorner = { corner: 'nw', x: start.left, y: start.top };
        } else if (dragging.mode === 'resize-nw') {
          fixedCorner = { corner: 'se', x: right, y: bottom };
        } else if (dragging.mode === 'resize-ne') {
          fixedCorner = { corner: 'sw', x: start.left, y: bottom };
        } else if (dragging.mode === 'resize-sw') {
          fixedCorner = { corner: 'ne', x: right, y: start.top };
        } else if (dragging.mode === 'resize-circle') {
          fixedCorner = {
            corner: 'center',
            x: start.left + start.width / 2,
            y: start.top + start.height / 2,
          };
        }

        const displayStartBounds = containBounds(
          {
            left: start.left * 100,
            top: start.top * 100,
            width: start.width * 100,
            height: start.height * 100,
          },
          imageAspect,
          containerAspect
        );
        const displayNextBounds = containBounds(
          {
            left: next.left * 100,
            top: next.top * 100,
            width: next.width * 100,
            height: next.height * 100,
          },
          imageAspect,
          containerAspect
        );

        // eslint-disable-next-line no-console
        console.log('[RESIZE DEBUG]', {
          dragMode: dragging.mode,
          containerRect: container,
          imageAspect,
          containerAspect,
          containBoundsStart: displayStartBounds,
          containBoundsNext: displayNextBounds,
          mouseClientX: e.clientX,
          mouseClientY: e.clientY,
          normalizedXY: pointerNorm,
          startPointer: dragging.startPointer,
          startBounds: start,
          fixedCorner,
          newMarkerBox: next,
        });
      }
      // --- /RESIZE DEBUG ---

      onUpdate(
        index - 1,
        normalizedBoundsToMarker(marker, next, coordWidth, coordHeight, mode)
      );
    },
    [
      dragging,
      containerRef,
      imageAspect,
      containerAspect,
      marker,
      index,
      coordWidth,
      coordHeight,
      mode,
      onUpdate,
    ]
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

      {isCircle ? (
        <div
          className={`${HANDLE_CLASS} -right-1.5 top-1/2 -translate-y-1/2 cursor-e-resize`}
          onPointerDown={(e) => handlePointerDown(e, 'resize-circle')}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        />
      ) : (
        RECT_HANDLES.map((h) => (
          <div
            key={h.mode}
            className={`${HANDLE_CLASS} ${h.className}`}
            onPointerDown={(e) => handlePointerDown(e, h.mode)}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
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
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

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

  if (!markers.length) return null;

  const { width: coordWidth, height: coordHeight, mode } = resolveCoordinateDimensions(
    markers,
    imageWidth,
    imageHeight
  );
  const imageAspect =
    imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : coordWidth / (coordHeight || 1);
  const containerAspect =
    containerSize.w > 0 && containerSize.h > 0
      ? containerSize.w / containerSize.h
      : imageAspect;

  const handleUpdate = useCallback(
    (idx, updated) => {
      onChange((prev) => {
        const list = Array.isArray(prev) ? prev : markers;
        return list.map((m, i) => (i === idx ? { ...updated } : m));
      });
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
          containerAspect={containerAspect}
          containerRef={containerRef}
          onUpdate={handleUpdate}
        />
      ))}
    </div>
  );
}
