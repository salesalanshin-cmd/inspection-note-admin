'use client';

import { useEffect, useRef, useState } from 'react';
import {
  containBounds,
  isCircleMarker,
  markerBounds,
  parseMarkingData,
  resolveCoordinateDimensions,
} from '../lib/markingData';

const SHAPE_STYLE =
  'absolute border-2 border-danger bg-danger/25 touch-none select-none';

function DetailShape({ marker, index, coordWidth, coordHeight, imageAspect, containerAspect }) {
  const imageBounds = markerBounds(marker, coordWidth, coordHeight);
  if (!imageBounds) return null;

  const bounds =
    containBounds(imageBounds, imageAspect, containerAspect) || imageBounds;
  const isCircle = isCircleMarker(marker);

  return (
    <div
      className={`${SHAPE_STYLE} ${isCircle ? 'rounded-full' : 'rounded-md'}`}
      style={{
        left: `${bounds.left}%`,
        top: `${bounds.top}%`,
        width: `${bounds.width}%`,
        height: `${bounds.height}%`,
      }}
    >
      <span className="absolute -top-0.5 -left-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[10px] text-white shadow-sm">
        {index}
      </span>
    </div>
  );
}

/**
 * 읽기 전용 마킹 오버레이 (상세/미리보기)
 * object-contain 레터박스를 반영해 위치를 맞춥니다.
 */
export default function DefectMarkerOverlay({
  markingData,
  imageWidth,
  imageHeight,
  variant = 'detail',
}) {
  const rootRef = useRef(null);
  const [containerAspect, setContainerAspect] = useState(null);

  useEffect(() => {
    const el = rootRef.current?.parentElement;
    if (!el) return undefined;

    const sync = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerAspect(rect.width / rect.height);
      }
    };
    sync();
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (variant !== 'detail') return null;

  const markers = parseMarkingData(markingData);
  if (!markers.length) return null;

  const { width: coordWidth, height: coordHeight } = resolveCoordinateDimensions(
    markers,
    imageWidth,
    imageHeight
  );
  const imageAspect =
    imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : coordWidth / coordHeight;

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {markers.map((marker, i) => (
        <DetailShape
          key={`${marker.type}-${i + 1}`}
          marker={marker}
          index={i + 1}
          coordWidth={coordWidth}
          coordHeight={coordHeight}
          imageAspect={imageAspect}
          containerAspect={containerAspect || imageAspect}
        />
      ))}
    </div>
  );
}
