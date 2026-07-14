'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ZoomIn } from 'lucide-react';
import { getImageUrl } from '../lib/getImageUrl';

const LENS_SIZE = 200;
const ZOOM = 5;

/**
 * 돋보기 토글 + (켜진 상태에서만) 마우스 오버 렌즈 확대
 * 기본 OFF → 마킹 드래그/리사이즈를 방해하지 않음
 * 모바일(터치): 토글/렌즈 숨김
 */
export default function ImageZoom({
  url,
  alt = '',
  fit = 'contain',
  sizes = '800px',
  bucket,
  children,
  className = '',
}) {
  const containerRef = useRef(null);
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [canHoverZoom, setCanHoverZoom] = useState(false);
  const [zoomEnabled, setZoomEnabled] = useState(false);
  const [lens, setLens] = useState(null);

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
    };
  }, [url, bucket]);

  useEffect(() => {
    if (!zoomEnabled) setLens(null);
  }, [zoomEnabled]);

  function handleMouseMove(e) {
    if (!canHoverZoom || !zoomEnabled || !src) return;
    const el = containerRef.current;
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

  const objectFit = fit === 'contain' ? 'object-contain' : 'object-cover';

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full ${className}`.trim()}
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
        <Image src={src} alt={alt} fill sizes={sizes} className={objectFit} />
      )}

      {children}

      {canHoverZoom && src ? (
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
          className={`absolute right-2 top-2 z-40 flex h-9 w-9 items-center justify-center rounded-full shadow-card transition-colors ${
            zoomEnabled
              ? 'bg-accent text-white ring-2 ring-accent/40'
              : 'bg-white/90 text-muted hover:text-text'
          }`}
        >
          <ZoomIn className="h-4 w-4" strokeWidth={2.25} />
        </button>
      ) : null}

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
            backgroundSize: `${ZOOM * 100}%`,
            backgroundPosition: lens.bgPos,
          }}
        />
      ) : null}
    </div>
  );
}
