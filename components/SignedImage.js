'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { getImageUrl } from '../lib/getImageUrl';

/**
 * Supabase Storage signed URL + (가능 시) 이미지 변환 썸네일.
 * 뷰포트 진입 시에만 URL을 발급·로드합니다 (Intersection Observer).
 *
 * @param {'thumbnail' | 'full'} [size]
 */
export default function SignedImage({
  url,
  alt,
  fit = 'cover',
  sizes = '200px',
  bucket,
  size = 'thumbnail',
  eager = false,
}) {
  const objectFit = fit === 'contain' ? 'object-contain' : 'object-cover';
  const rootRef = useRef(null);
  const [inView, setInView] = useState(eager);
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [usedTransform, setUsedTransform] = useState(true);

  useEffect(() => {
    if (eager || inView) return undefined;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px', threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [eager, inView]);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    setUsedTransform(true);

    if (!inView) return undefined;

    if (!url) {
      setFailed(true);
      return undefined;
    }

    const opts = {
      size,
      ...(bucket ? { bucket } : {}),
    };

    getImageUrl(url, opts)
      .then((signedUrl) => {
        if (cancelled) return;
        if (!signedUrl) {
          setFailed(true);
          return;
        }
        // transform URL은 path에 /render/image/ 포함
        setUsedTransform(signedUrl.includes('/render/image/'));
        setSrc(signedUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [url, bucket, size, inView]);

  async function handleError() {
    if (!url) {
      setFailed(true);
      return;
    }
    // transform 응답이 깨진 경우 원본 URL로 1회 재시도
    if (usedTransform) {
      setUsedTransform(false);
      try {
        const plain = await getImageUrl(url, {
          transform: null,
          ...(bucket ? { bucket } : {}),
        });
        if (plain) {
          setSrc(plain);
          return;
        }
      } catch {
        // fall through
      }
    }
    setFailed(true);
  }

  if (failed) {
    return (
      <div
        ref={rootRef}
        className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] text-muted"
      >
        이미지를 불러올 수 없음
      </div>
    );
  }

  if (!inView || !src) {
    return (
      <div
        ref={rootRef}
        className="absolute inset-0 flex items-center justify-center text-[11px] text-muted"
      >
        {inView ? '불러오는 중...' : ''}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="absolute inset-0">
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={objectFit}
        loading={eager ? 'eager' : 'lazy'}
        onError={handleError}
      />
    </div>
  );
}
