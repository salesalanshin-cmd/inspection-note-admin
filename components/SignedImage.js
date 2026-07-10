'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { getImageUrl } from '../lib/getImageUrl';

export default function SignedImage({ url, alt, fit = 'cover', sizes = '200px', bucket }) {
  const objectFit = fit === 'contain' ? 'object-contain' : 'object-cover';
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);

    if (!url) {
      setFailed(true);
      return undefined;
    }

    getImageUrl(url, bucket ? { bucket } : undefined)
      .then((signedUrl) => {
        if (cancelled) return;
        if (!signedUrl) {
          setFailed(true);
          return;
        }
        setSrc(signedUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [url, bucket]);

  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-muted text-[11px] text-center px-2">
        이미지를 불러올 수 없음
      </div>
    );
  }

  if (!src) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-muted text-[11px]">
        불러오는 중...
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className={objectFit}
      onError={() => setFailed(true)}
    />
  );
}
