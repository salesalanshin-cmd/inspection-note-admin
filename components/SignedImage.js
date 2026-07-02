'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { supabase } from '../lib/supabase';
import { extractStoragePath } from '../lib/storagePath';

// signed URL 재발급 유효 시간 (초) - 화면 보는 동안만 유효하면 되므로 1시간이면 충분
const SIGNED_URL_TTL = 60 * 60;

export default function SignedImage({ url, alt }) {
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

    const parsed = extractStoragePath(url);
    // storage URL 형태가 아니면(이미 완전한 public URL 등) 원본 그대로 사용
    if (!parsed) {
      setSrc(url);
      return undefined;
    }

    supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, SIGNED_URL_TTL)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          setFailed(true);
          return;
        }
        setSrc(data.signedUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-muted text-[11px] font-mono text-center px-2">
        이미지를 불러올 수 없음
      </div>
    );
  }

  if (!src) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-muted text-[11px] font-mono">
        불러오는 중...
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="200px"
      className="object-cover"
      onError={() => setFailed(true)}
    />
  );
}
