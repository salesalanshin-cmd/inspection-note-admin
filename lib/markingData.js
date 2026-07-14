/**
 * marking_data 파싱 및 좌표 환산 유틸
 *
 * DB 실측 — 좌표 형식이 3가지 혼재:
 * 1. ratio  (83건): ratioX, ratioY, ratioW, ratioH — 0~1 정규화 비율 (이미지 기준)
 * 2. canvas (21건): x/y/width/height 또는 cx/cy/r — 앱 마킹 뷰 픽셀 (max ≈ 150~300)
 * 3. image  ( 1건): x/y — 원본 이미지 픽셀 (max ≈ image_width의 60%)
 *
 * canvas 형식은 image_width(3000 등)로 나누면 위치가 어긋나므로,
 * marking_data 좌표 최댓값을 마킹 캔버스 추정 크기로 사용합니다.
 */

export function parseMarkingData(raw) {
  if (!raw) return [];
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(data) ? data : [];
}

/** marking_data 내 좌표의 최대 범위 (캔버스 추정 크기) */
export function getMarkerExtents(markers) {
  let maxX = 0;
  let maxY = 0;
  for (const m of markers) {
    if (m.ratioX !== undefined) {
      maxX = Math.max(maxX, (m.ratioX || 0) + (m.ratioW || 0));
      maxY = Math.max(maxY, (m.ratioY || 0) + (m.ratioH || 0));
    } else if (m.type === 'circle' || m.cx !== undefined) {
      maxX = Math.max(maxX, (m.cx || 0) + (m.r || 0));
      maxY = Math.max(maxY, (m.cy || 0) + (m.r || 0));
    } else {
      maxX = Math.max(maxX, (m.x || 0) + (m.width || 0));
      maxY = Math.max(maxY, (m.y || 0) + (m.height || 0));
    }
  }
  return { maxX, maxY };
}

const IMAGE_SPACE_THRESHOLD = 0.3;

/**
 * 좌표 환산에 쓸 기준 크기와 모드 반환
 * @returns {{ width: number, height: number, mode: 'ratio'|'image'|'canvas'|'unknown' }}
 */
export function resolveCoordinateDimensions(markers, imageWidth, imageHeight) {
  if (!markers.length) {
    return { width: imageWidth || 1, height: imageHeight || 1, mode: 'unknown' };
  }

  if (markers.some((m) => m.ratioX !== undefined)) {
    return { width: 1, height: 1, mode: 'ratio' };
  }

  const { maxX, maxY } = getMarkerExtents(markers);

  if (maxX <= 0 && maxY <= 0) {
    return {
      width: imageWidth > 0 ? imageWidth : 1,
      height: imageHeight > 0 ? imageHeight : 1,
      mode: 'unknown',
    };
  }

  const iw = imageWidth > 0 ? imageWidth : 0;
  const ih = imageHeight > 0 ? imageHeight : 0;
  const looksLikeImageSpace =
    iw > 0 &&
    ih > 0 &&
    maxX >= iw * IMAGE_SPACE_THRESHOLD &&
    maxY >= ih * IMAGE_SPACE_THRESHOLD;

  if (looksLikeImageSpace) {
    return { width: iw, height: ih, mode: 'image' };
  }

  return { width: maxX, height: maxY, mode: 'canvas' };
}

/** @deprecated resolveCoordinateDimensions 사용 */
export function resolveImageDimensions(markers, imageWidth, imageHeight) {
  const { width, height } = resolveCoordinateDimensions(markers, imageWidth, imageHeight);
  return { width, height };
}

/** object-cover 컨테이너 안에서 정규화 좌표(0~1)를 화면 %로 변환 */
export function coverPosition(normX, normY, imageAspect, containerAspect) {
  if (imageAspect > containerAspect) {
    const visibleWidth = containerAspect / imageAspect;
    const offsetX = (1 - visibleWidth) / 2;
    return { left: `${(offsetX + normX * visibleWidth) * 100}%`, top: `${normY * 100}%` };
  }
  const visibleHeight = imageAspect / containerAspect;
  const offsetY = (1 - visibleHeight) / 2;
  return { left: `${normX * 100}%`, top: `${(offsetY + normY * visibleHeight) * 100}%` };
}

/**
 * object-cover 컨테이너에서 마킹 도형 bounds(% 단위)를 보정
 * @param {{ left: number, top: number, width: number, height: number }} bounds - 이미지 기준 0~100%
 */
export function coverBounds(bounds, imageAspect, containerAspect) {
  const L = bounds.left / 100;
  const T = bounds.top / 100;
  const W = bounds.width / 100;
  const H = bounds.height / 100;

  if (imageAspect > containerAspect) {
    const visibleWidth = containerAspect / imageAspect;
    const offsetX = (1 - visibleWidth) / 2;
    return {
      left: (offsetX + L * visibleWidth) * 100,
      top: T * 100,
      width: W * visibleWidth * 100,
      height: H * 100,
    };
  }
  const visibleHeight = imageAspect / containerAspect;
  const offsetY = (1 - visibleHeight) / 2;
  return {
    left: L * 100,
    top: (offsetY + T * visibleHeight) * 100,
    width: W * 100,
    height: H * visibleHeight * 100,
  };
}

/**
 * object-contain 컨테이너에서 마킹 bounds(이미지 기준 0~100%) → 컨테이너 %
 * (레터박스/필러박스 여백을 반영하지 않으면 구석으로 쏠림)
 */
export function containBounds(bounds, imageAspect, containerAspect) {
  if (!bounds) return null;
  if (!(imageAspect > 0) || !(containerAspect > 0)) return bounds;
  if (Math.abs(imageAspect - containerAspect) < 0.002) return bounds;

  const L = bounds.left / 100;
  const T = bounds.top / 100;
  const W = bounds.width / 100;
  const H = bounds.height / 100;

  if (imageAspect > containerAspect) {
    // 가로로 맞춤 → 위아래 레터박스
    const scaleY = containerAspect / imageAspect;
    const offsetY = (1 - scaleY) / 2;
    return {
      left: L * 100,
      top: (offsetY + T * scaleY) * 100,
      width: W * 100,
      height: H * scaleY * 100,
    };
  }

  // 세로로 맞춤 → 좌우 필러박스
  const scaleX = imageAspect / containerAspect;
  const offsetX = (1 - scaleX) / 2;
  return {
    left: (offsetX + L * scaleX) * 100,
    top: T * 100,
    width: W * scaleX * 100,
    height: H * 100,
  };
}

export function markerCenter(marker, coordWidth, coordHeight, mode) {
  if (marker.ratioX !== undefined) {
    return {
      x: marker.ratioX + (marker.ratioW || 0) / 2,
      y: marker.ratioY + (marker.ratioH || 0) / 2,
      normalized: true,
    };
  }
  if (marker.type === 'circle' || marker.cx !== undefined) {
    return { x: marker.cx, y: marker.cy, normalized: false };
  }
  if (marker.type === 'rect' || marker.x !== undefined) {
    return {
      x: marker.x + (marker.width || 0) / 2,
      y: marker.y + (marker.height || 0) / 2,
      normalized: false,
    };
  }
  return { x: 0, y: 0, normalized: false };
}

export function markerBounds(marker, coordWidth, coordHeight) {
  if (marker.ratioX !== undefined) {
    return {
      left: marker.ratioX * 100,
      top: marker.ratioY * 100,
      width: (marker.ratioW || 0) * 100,
      height: (marker.ratioH || 0) * 100,
    };
  }

  const w = coordWidth || 1;
  const h = coordHeight || 1;

  if (marker.type === 'circle' || marker.cx !== undefined) {
    const r = marker.r || 0;
    return {
      left: ((marker.cx - r) / w) * 100,
      top: ((marker.cy - r) / h) * 100,
      width: ((2 * r) / w) * 100,
      height: ((2 * r) / h) * 100,
    };
  }

  if (marker.type === 'rect' || marker.x !== undefined) {
    return {
      left: (marker.x / w) * 100,
      top: (marker.y / h) * 100,
      width: (marker.width / w) * 100,
      height: (marker.height / h) * 100,
    };
  }

  return null;
}

export function centerToNormalized(center, coordWidth, coordHeight, mode) {
  if (center.normalized || mode === 'ratio') {
    return { x: center.x, y: center.y };
  }
  return {
    x: center.x / (coordWidth || 1),
    y: center.y / (coordHeight || 1),
  };
}

export function isCircleMarker(marker) {
  return marker.type === 'circle' || (marker.cx !== undefined && marker.ratioX === undefined);
}

export function cloneMarkingData(raw) {
  return parseMarkingData(raw).map((m) => ({ ...m }));
}

/** object-contain 레이아웃에서 이미지가 실제로 그려지는 영역 */
export function getContainLayout(containerWidth, containerHeight, imageAspect) {
  if (!containerWidth || !containerHeight || !imageAspect) {
    return {
      offsetX: 0,
      offsetY: 0,
      displayWidth: containerWidth || 1,
      displayHeight: containerHeight || 1,
    };
  }
  const containerAspect = containerWidth / containerHeight;
  if (imageAspect > containerAspect) {
    const displayWidth = containerWidth;
    const displayHeight = containerWidth / imageAspect;
    return {
      offsetX: 0,
      offsetY: (containerHeight - displayHeight) / 2,
      displayWidth,
      displayHeight,
    };
  }
  const displayHeight = containerHeight;
  const displayWidth = containerHeight * imageAspect;
  return {
    offsetX: (containerWidth - displayWidth) / 2,
    offsetY: 0,
    displayWidth,
    displayHeight,
  };
}

/** 화면 좌표 → 이미지 정규화 좌표(0~1), object-contain 기준 */
export function screenToNormalizedInContain(clientX, clientY, containerRect, imageAspect) {
  const { offsetX, offsetY, displayWidth, displayHeight } = getContainLayout(
    containerRect.width,
    containerRect.height,
    imageAspect
  );
  const x = (clientX - containerRect.left - offsetX) / (displayWidth || 1);
  const y = (clientY - containerRect.top - offsetY) / (displayHeight || 1);
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  };
}

/** marker → 정규화 bounds (0~1) */
export function markerToNormalizedBounds(marker, coordWidth, coordHeight) {
  const b = markerBounds(marker, coordWidth, coordHeight);
  if (!b) return null;
  return {
    left: b.left / 100,
    top: b.top / 100,
    width: b.width / 100,
    height: b.height / 100,
  };
}

/** 정규화 bounds(0~1) → marking_data 항목 (기존 형식 유지) */
export function normalizedBoundsToMarker(marker, bounds, coordWidth, coordHeight, mode) {
  const cw = coordWidth || 1;
  const ch = coordHeight || 1;
  const L = bounds.left;
  const T = bounds.top;
  const W = bounds.width;
  const H = bounds.height;

  if (marker.ratioX !== undefined || mode === 'ratio') {
    return {
      type: marker.type || 'rect',
      ratioX: L,
      ratioY: T,
      ratioW: W,
      ratioH: H,
    };
  }

  if (isCircleMarker(marker)) {
    const r = (W * cw) / 2;
    return {
      type: 'circle',
      cx: L * cw + r,
      cy: T * ch + r,
      r,
    };
  }

  return {
    type: 'rect',
    x: L * cw,
    y: T * ch,
    width: W * cw,
    height: H * ch,
  };
}

export function clampBounds(bounds, minSize = 0.02) {
  const width = Math.max(minSize, Math.min(bounds.width, 1 - bounds.left));
  const height = Math.max(minSize, Math.min(bounds.height, 1 - bounds.top));
  const left = Math.max(0, Math.min(bounds.left, 1 - width));
  const top = Math.max(0, Math.min(bounds.top, 1 - height));
  return { left, top, width, height };
}

/**
 * 마킹 move/resize — 화면 pointer를 object-contain 정규화 좌표로 변환한 뒤
 * 다음 bounds(0~1)를 계산. 드래그·리사이즈가 동일 유틸을 공유.
 *
 * @param {'move'|'resize-nw'|'resize-ne'|'resize-sw'|'resize-se'|'resize-circle'} dragMode
 * @param {{ left: number, top: number, width: number, height: number }} startBounds
 * @param {{ x: number, y: number }} startPointer
 * @param {{ x: number, y: number }} pointerNorm
 */
export function computeMarkerDragBounds(dragMode, startBounds, startPointer, pointerNorm, minSize = 0.02) {
  if (dragMode === 'move') {
    const dx = pointerNorm.x - startPointer.x;
    const dy = pointerNorm.y - startPointer.y;
    return clampBounds(
      {
        left: startBounds.left + dx,
        top: startBounds.top + dy,
        width: startBounds.width,
        height: startBounds.height,
      },
      minSize
    );
  }

  if (dragMode === 'resize-circle') {
    const cx = startBounds.left + startBounds.width / 2;
    const cy = startBounds.top + startBounds.height / 2;
    const halfW = Math.max(minSize / 2, Math.abs(pointerNorm.x - cx));
    const halfH = Math.max(minSize / 2, Math.abs(pointerNorm.y - cy));
    const half = Math.max(halfW, halfH);
    return clampBounds(
      {
        left: cx - half,
        top: cy - half,
        width: half * 2,
        height: half * 2,
      },
      minSize
    );
  }

  const right = startBounds.left + startBounds.width;
  const bottom = startBounds.top + startBounds.height;

  if (dragMode === 'resize-se') {
    // 좌상단 고정
    return clampBounds(
      {
        left: startBounds.left,
        top: startBounds.top,
        width: Math.max(minSize, pointerNorm.x - startBounds.left),
        height: Math.max(minSize, pointerNorm.y - startBounds.top),
      },
      minSize
    );
  }

  if (dragMode === 'resize-nw') {
    // 우하단 고정
    const left = Math.min(pointerNorm.x, right - minSize);
    const top = Math.min(pointerNorm.y, bottom - minSize);
    return clampBounds(
      {
        left,
        top,
        width: right - left,
        height: bottom - top,
      },
      minSize
    );
  }

  if (dragMode === 'resize-ne') {
    // 좌하단 고정
    const top = Math.min(pointerNorm.y, bottom - minSize);
    return clampBounds(
      {
        left: startBounds.left,
        top,
        width: Math.max(minSize, pointerNorm.x - startBounds.left),
        height: bottom - top,
      },
      minSize
    );
  }

  if (dragMode === 'resize-sw') {
    // 우상단 고정
    const left = Math.min(pointerNorm.x, right - minSize);
    return clampBounds(
      {
        left,
        top: startBounds.top,
        width: right - left,
        height: Math.max(minSize, pointerNorm.y - startBounds.top),
      },
      minSize
    );
  }

  return clampBounds({ ...startBounds }, minSize);
}
