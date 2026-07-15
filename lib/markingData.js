/**
 * marking_data 파싱 및 좌표 환산 유틸
 *
 * 좌표 형식이 혼재:
 * 1. ratio:true (신규 앱): x/y/width/height 또는 cx/cy/r 가 이미 0~1 비율
 * 2. ratioX/Y/W/H (레거시 관리자 저장): 0~1 정규화 비율
 * 3. canvas: x/y/width/height 또는 cx/cy/r — 앱 마킹 뷰 픽셀 (max ≈ 150~300)
 * 4. image: x/y — 원본 이미지 픽셀 (max ≈ image_width의 60%)
 *
 * canvas 형식은 image_width(3000 등)로 나누면 위치가 어긋나므로,
 * marking_data 좌표 최댓값을 마킹 캔버스 추정 크기로 사용합니다.
 *
 * 관리자 콘솔에서 편집·저장하는 마킹은 항상 ratio:true 형식으로 통일합니다.
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

/** 신규 ratio:true 또는 레거시 ratioX — 이미 0~1 정규화된 마킹 */
export function isNormalizedRatioMarker(marker) {
  return marker?.ratio === true || marker?.ratioX !== undefined;
}

/** marking_data 내 좌표의 최대 범위 (캔버스 추정 크기) — 픽셀 좌표만 */
export function getMarkerExtents(markers) {
  let maxX = 0;
  let maxY = 0;
  for (const m of markers) {
    if (isNormalizedRatioMarker(m)) continue;
    if (m.type === 'circle' || m.cx !== undefined) {
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

  const pixelMarkers = markers.filter((m) => !isNormalizedRatioMarker(m));

  // 전부 비율 형식이면 image_width로 나누지 않음
  if (pixelMarkers.length === 0) {
    return { width: 1, height: 1, mode: 'ratio' };
  }

  const { maxX, maxY } = getMarkerExtents(pixelMarkers);

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
 * object-contain: 컨테이너 안에 이미지가 실제로 그려지는 픽셀 영역.
 * CSS object-contain과 동일:
 * - imageAspect > containerAspect → 너비 맞춤, 상하 레터박스
 * - imageAspect < containerAspect → 높이 맞춤, 좌우 필러박스
 */
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
  let displayWidth;
  let displayHeight;
  let offsetX;
  let offsetY;

  if (imageAspect > containerAspect) {
    // 이미지가 더 넓음 — 너비 기준, 상하 여백
    displayWidth = containerWidth;
    displayHeight = containerWidth / imageAspect;
    offsetX = 0;
    offsetY = (containerHeight - displayHeight) / 2;
  } else {
    // 이미지가 더 좁음/김 — 높이 기준, 좌우 여백
    displayHeight = containerHeight;
    displayWidth = containerHeight * imageAspect;
    offsetY = 0;
    offsetX = (containerWidth - displayWidth) / 2;
  }

  return { offsetX, offsetY, displayWidth, displayHeight };
}

/**
 * getContainLayout 결과로 이미지 bounds(%) → 컨테이너 % 변환.
 * 표시·드래그 역변환이 동일한 레이아웃을 공유하도록 한다.
 */
export function containBoundsFromLayout(bounds, layout, containerWidth, containerHeight) {
  if (!bounds) return null;
  if (!containerWidth || !containerHeight) return bounds;

  const { offsetX, offsetY, displayWidth, displayHeight } = layout;
  const L = bounds.left / 100;
  const T = bounds.top / 100;
  const W = bounds.width / 100;
  const H = bounds.height / 100;

  return {
    left: ((offsetX + L * displayWidth) / containerWidth) * 100,
    top: ((offsetY + T * displayHeight) / containerHeight) * 100,
    width: ((W * displayWidth) / containerWidth) * 100,
    height: ((H * displayHeight) / containerHeight) * 100,
  };
}

/**
 * object-contain 컨테이너에서 마킹 bounds(이미지 기준 0~100%) → 컨테이너 %
 * (레터박스/필러박스 여백을 반영하지 않으면 구석으로 쏠림)
 * aspect만 있는 호출자용 — 내부적으로 getContainLayout과 동일 공식.
 */
export function containBounds(bounds, imageAspect, containerAspect) {
  if (!bounds) return null;
  if (!(imageAspect > 0) || !(containerAspect > 0)) return bounds;

  // 단위 컨테이너(height=1, width=containerAspect)로 픽셀 레이아웃과 동일한 경로 사용
  const layout = getContainLayout(containerAspect, 1, imageAspect);
  return containBoundsFromLayout(bounds, layout, containerAspect, 1);
}

export function markerCenter(marker, coordWidth, coordHeight, mode) {
  if (marker.ratioX !== undefined) {
    return {
      x: marker.ratioX + (marker.ratioW || 0) / 2,
      y: marker.ratioY + (marker.ratioH || 0) / 2,
      normalized: true,
    };
  }
  if (marker.ratio === true) {
    if (marker.type === 'circle' || marker.cx !== undefined) {
      return { x: marker.cx || 0, y: marker.cy || 0, normalized: true };
    }
    return {
      x: (marker.x || 0) + (marker.width || 0) / 2,
      y: (marker.y || 0) + (marker.height || 0) / 2,
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
  // 레거시 ratioX/Y/W/H
  if (marker.ratioX !== undefined) {
    return {
      left: marker.ratioX * 100,
      top: marker.ratioY * 100,
      width: (marker.ratioW || 0) * 100,
      height: (marker.ratioH || 0) * 100,
    };
  }

  // 신규 앱: ratio:true → x/y/width/height 또는 cx/cy/r 가 이미 0~1
  if (marker.ratio === true) {
    if (marker.type === 'circle' || marker.cx !== undefined) {
      const r = marker.r || 0;
      return {
        left: ((marker.cx || 0) - r) * 100,
        top: ((marker.cy || 0) - r) * 100,
        width: 2 * r * 100,
        height: 2 * r * 100,
      };
    }
    return {
      left: (marker.x || 0) * 100,
      top: (marker.y || 0) * 100,
      width: (marker.width || 0) * 100,
      height: (marker.height || 0) * 100,
    };
  }

  // 픽셀(absolute) — image_width/height 또는 캔버스 추정 크기로 나눔
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
  if (marker.type === 'circle') return true;
  if (marker.cx !== undefined && marker.ratioX === undefined) return true;
  return false;
}

export function cloneMarkingData(raw) {
  return parseMarkingData(raw).map((m) => ({ ...m }));
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

/** 이미지 정규화 좌표(0~1) → 컨테이너 로컬 픽셀 (object-contain) */
export function normalizedToScreenInContain(normX, normY, containerWidth, containerHeight, imageAspect) {
  const { offsetX, offsetY, displayWidth, displayHeight } = getContainLayout(
    containerWidth,
    containerHeight,
    imageAspect
  );
  return {
    x: offsetX + normX * displayWidth,
    y: offsetY + normY * displayHeight,
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

/**
 * 정규화 bounds(0~1) → marking_data 항목
 * 관리자 콘솔 편집 결과는 항상 신규 ratio:true 형식으로 저장한다.
 * (coordWidth/coordHeight/mode는 하위 호환용으로 남기며 저장 형식에는 쓰지 않음)
 * marker.code 등 부가 필드는 유지한다.
 */
export function normalizedBoundsToMarker(marker, bounds, _coordWidth, _coordHeight, _mode) {
  const L = bounds.left;
  const T = bounds.top;
  const W = bounds.width;
  const H = bounds.height;

  if (isCircleMarker(marker)) {
    const r = Math.max(W, H) / 2;
    const next = {
      type: 'circle',
      ratio: true,
      cx: L + W / 2,
      cy: T + H / 2,
      r,
    };
    if (marker.code) next.code = marker.code;
    return next;
  }

  const next = {
    type: marker.type || 'rect',
    ratio: true,
    x: L,
    y: T,
    width: W,
    height: H,
  };
  if (marker.code) next.code = marker.code;
  return next;
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
