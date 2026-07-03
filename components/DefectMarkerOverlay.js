'use client';

import {
  isCircleMarker,
  markerBounds,
  parseMarkingData,
  resolveCoordinateDimensions,
} from '../lib/markingData';

const SHAPE_STYLE =
  'absolute border-2 border-danger bg-danger/25 touch-none select-none';

function DetailShape({ marker, index, coordWidth, coordHeight }) {
  const bounds = markerBounds(marker, coordWidth, coordHeight);
  if (!bounds) return null;

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
 * @param {'detail'} [props.variant='detail']
 */
export default function DefectMarkerOverlay({
  markingData,
  imageWidth,
  imageHeight,
  variant = 'detail',
}) {
  if (variant !== 'detail') return null;

  const markers = parseMarkingData(markingData);
  if (!markers.length) return null;

  const { width: coordWidth, height: coordHeight } = resolveCoordinateDimensions(
    markers,
    imageWidth,
    imageHeight
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {markers.map((marker, i) => (
        <DetailShape
          key={`${marker.type}-${i + 1}`}
          marker={marker}
          index={i + 1}
          coordWidth={coordWidth}
          coordHeight={coordHeight}
        />
      ))}
    </div>
  );
}
