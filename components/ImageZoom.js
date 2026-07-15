'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { getImageUrl } from '../lib/getImageUrl';

const LENS_SIZE = 200;
const LENS_ZOOM = 5;
/** 1x → 2x → … → 10x */
const SCALE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function formatScale(n) {
  return `${n}x`;
}

function assignRef(ref, value) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else ref.current = value;
}

/**
 * 돋보기(렌즈) + 선택적 +/- 전체 배율
 * - +/- : 뷰포트 중심 유지 확대/축소
 * - 배율>1 & !panDisabled: 드래그 팬 (document 리스너 + 전용 히트 레이어)
 */
export default function ImageZoom({
  url,
  alt = '',
  fit = 'contain',
  sizes = '800px',
  bucket,
  children,
  className = '',
  enableScaleControls = false,
  contentRef: contentRefProp,
  /** true면 드래그 팬 비활성 (문서 영역 지정 모드 등) */
  panDisabled = false,
  /** 이미지 로드 후 naturalWidth/Height 전달 (contain 좌표용) */
  onNaturalSize,
}) {
  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const pendingScrollRef = useRef(null);
  const panRef = useRef(null);
  const panCleanupRef = useRef(null);

  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [canHoverZoom, setCanHoverZoom] = useState(false);
  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [lens, setLens] = useState(null);
  const [scaleIndex, setScaleIndex] = useState(0);
  const [panning, setPanning] = useState(false);
  const scale = SCALE_STEPS[scaleIndex] ?? 1;
  const canPan = enableScaleControls && scale > 1 && !panDisabled;

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setCanHoverZoom(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    setLens(null);
    setScaleIndex(0);
    setPanning(false);
    panRef.current = null;
    pendingScrollRef.current = null;
    panCleanupRef.current?.();
    panCleanupRef.current = null;

    if (!url) {
      setFailed(true);
      return undefined;
    }

    getImageUrl(url, bucket ? { bucket } : undefined)
      .then((signed) => {
        if (cancelled) return;
        if (!signed) {
          setFailed(true);
          return;
        }
        setSrc(signed);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      panCleanupRef.current?.();
      panCleanupRef.current = null;
    };
  }, [url, bucket]);

  useEffect(() => {
    if (!zoomEnabled) setLens(null);
  }, [zoomEnabled]);

  useEffect(() => {
    if (!zoomEnabled) return undefined;

    const onPointerDown = (e) => {
      const el = contentRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setZoomEnabled(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [zoomEnabled]);

  // 배율 변경 후: 뷰포트 중심에 보이던 지점이 유지되도록 스크롤 보정
  useLayoutEffect(() => {
    const pending = pendingScrollRef.current;
    const viewport = viewportRef.current;
    if (!pending || !viewport) return;
    pendingScrollRef.current = null;

    const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollLeft = Math.max(0, Math.min(maxLeft, pending.left));
    viewport.scrollTop = Math.max(0, Math.min(maxTop, pending.top));
  }, [scaleIndex]);

  // 영역 지정 ON / 1x 복귀 시 팬 정리
  useEffect(() => {
    if (panDisabled || scale <= 1) {
      panCleanupRef.current?.();
      panCleanupRef.current = null;
      panRef.current = null;
      setPanning(false);
    }
  }, [panDisabled, scale]);

  function setContentNode(node) {
    contentRef.current = node;
    assignRef(contentRefProp, node);
  }

  function handleMouseMove(e) {
    if (!canHoverZoom || !zoomEnabled || !src) return;
    if (panRef.current) return;
    const el = contentRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      setLens(null);
      return;
    }
    const pctX = (x / rect.width) * 100;
    const pctY = (y / rect.height) * 100;
    setLens({
      left: Math.max(0, Math.min(x - LENS_SIZE / 2, rect.width - LENS_SIZE)),
      top: Math.max(0, Math.min(y - LENS_SIZE / 2, rect.height - LENS_SIZE)),
      bgPos: `${pctX}% ${pctY}%`,
    });
  }

  function bumpScale(delta) {
    setScaleIndex((i) => {
      const next = Math.max(0, Math.min(SCALE_STEPS.length - 1, i + delta));
      if (next === i) return i;

      const viewport = viewportRef.current;
      const oldScale = SCALE_STEPS[i] ?? 1;
      const newScale = SCALE_STEPS[next] ?? 1;

      if (viewport && oldScale > 0) {
        const { scrollLeft, scrollTop, clientWidth, clientHeight } = viewport;
        const centerX = scrollLeft + clientWidth / 2;
        const centerY = scrollTop + clientHeight / 2;
        const ratio = newScale / oldScale;
        pendingScrollRef.current = {
          left: centerX * ratio - clientWidth / 2,
          top: centerY * ratio - clientHeight / 2,
        };
      }

      return next;
    });
  }

  /**
   * 팬 시작 — document에 move/up을 직접 등록.
   * (React 리렌더로 pointer capture가 끊기는 문제 회피)
   */
  function startPan(e) {
    if (!canPan) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    e.preventDefault();
    e.stopPropagation();

    panCleanupRef.current?.();

    const start = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    panRef.current = start;
    setPanning(true);
    setLens(null);

    const onMove = (ev) => {
      if (ev.pointerId !== start.pointerId) return;
      const vp = viewportRef.current;
      if (!vp) return;
      vp.scrollLeft = start.scrollLeft - (ev.clientX - start.x);
      vp.scrollTop = start.scrollTop - (ev.clientY - start.y);
    };

    const onUp = (ev) => {
      if (ev.pointerId !== start.pointerId) return;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      panCleanupRef.current = null;
      panRef.current = null;
      setPanning(false);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    panCleanupRef.current = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }

  const objectFit = fit === 'contain' ? 'object-contain' : 'object-cover';
  const showLensBtn = canHoverZoom && src;
  const showScale = enableScaleControls && src;

  const controlBtnClass =
    'flex h-9 w-9 items-center justify-center rounded-full shadow-card transition-colors bg-white/90 text-muted hover:text-text disabled:opacity-40';

  return (
    <div className={`relative h-full w-full ${className}`.trim()}>
      <div
        ref={viewportRef}
        className={`absolute inset-0 ${scale > 1 ? 'overflow-auto' : 'overflow-hidden'}`}
      >
        <div
          ref={setContentNode}
          className="relative"
          style={{
            width: `${scale * 100}%`,
            height: `${scale * 100}%`,
            minWidth: '100%',
            minHeight: '100%',
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setLens(null)}
        >
          {failed ? (
            <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] text-muted">
              이미지를 불러올 수 없음
            </div>
          ) : !src ? (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted">
              불러오는 중...
            </div>
          ) : (
            <Image
              src={src}
              alt={alt}
              fill
              sizes={sizes}
              className={`${objectFit} pointer-events-none`}
              draggable={false}
              onLoadingComplete={(img) => {
                if (img?.naturalWidth > 0 && img?.naturalHeight > 0) {
                  onNaturalSize?.({
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                  });
                }
              }}
            />
          )}

          {/*
            팬 전용 히트 레이어 (마커 z-10 아래).
            viewport React 핸들러만 쓰면 리렌더/캡처 유실로 팬이 끊겼음.
          */}
          {canPan ? (
            <div
              className={`absolute inset-0 z-[5] touch-none ${
                panning ? 'cursor-grabbing' : 'cursor-grab'
              }`}
              style={{ touchAction: 'none' }}
              onPointerDown={startPan}
              aria-hidden
            />
          ) : null}

          {children}

          {canHoverZoom && zoomEnabled && src && lens ? (
            <div
              aria-hidden
              className="pointer-events-none absolute z-30 hidden overflow-hidden rounded-full border-2 border-white shadow-card md:block"
              style={{
                width: LENS_SIZE,
                height: LENS_SIZE,
                left: lens.left,
                top: lens.top,
                backgroundImage: `url(${src})`,
                backgroundRepeat: 'no-repeat',
                backgroundSize: `${LENS_ZOOM * 100}%`,
                backgroundPosition: lens.bgPos,
              }}
            />
          ) : null}
        </div>
      </div>

      {(showScale || showLensBtn) && (
        <div className="pointer-events-none absolute right-2 top-2 z-40 flex items-center gap-1.5">
          {showScale ? (
            <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-white/90 p-0.5 shadow-card">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  bumpScale(-1);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={scaleIndex <= 0}
                aria-label="축소"
                title="축소"
                className={controlBtnClass}
              >
                <ZoomOut className="h-4 w-4" strokeWidth={2.25} />
              </button>
              <span className="min-w-[2.25rem] text-center text-[11px] font-medium text-text tabular-nums">
                {formatScale(scale)}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  bumpScale(1);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={scaleIndex >= SCALE_STEPS.length - 1}
                aria-label="확대"
                title="확대"
                className={controlBtnClass}
              >
                <ZoomIn className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </div>
          ) : null}

          {showLensBtn ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setZoomEnabled((v) => !v);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-pressed={zoomEnabled}
              aria-label={zoomEnabled ? '돋보기 끄기' : '돋보기 켜기'}
              title={zoomEnabled ? '돋보기 끄기' : '돋보기 켜기'}
              className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full shadow-card transition-colors ${
                zoomEnabled
                  ? 'bg-accent text-white ring-2 ring-accent/40'
                  : 'bg-white/90 text-muted hover:text-text'
              }`}
            >
              <ZoomIn className="h-4 w-4" strokeWidth={2.25} />
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
