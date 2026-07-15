import { createClient } from '@supabase/supabase-js';
import { extractStoragePath } from './storagePath';

const SIGNED_URL_TTL = 60 * 60;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase credentials not configured');
  }
  return createClient(url, key);
}

function guessMediaType(path, contentType) {
  if (contentType?.startsWith('image/')) return contentType;
  const lower = (path || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

/** data:image/...;base64,... → { base64, mediaType } */
function parseDataUrl(imageUrl) {
  const match = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  return {
    mediaType: match[1],
    base64: match[2].replace(/\s/g, ''),
  };
}

async function resolveFetchUrl(imageUrl) {
  const parsed = extractStoragePath(imageUrl);
  if (!parsed) return imageUrl;

  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, SIGNED_URL_TTL);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message || 'unknown'}`);
  }
  return { fetchUrl: data.signedUrl, path: parsed.path };
}

/** imageUrl (http / storage path / data URL) → { base64, mediaType } */
export async function fetchImageAsBase64(imageUrl) {
  if (!imageUrl) throw new Error('imageUrl is required');

  if (imageUrl.startsWith('data:')) {
    const parsed = parseDataUrl(imageUrl);
    if (!parsed) throw new Error('Invalid data URL');
    return parsed;
  }

  const resolved = await resolveFetchUrl(imageUrl);
  const fetchUrl = typeof resolved === 'string' ? resolved : resolved.fetchUrl;
  const path = typeof resolved === 'string' ? imageUrl : resolved.path;

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Image fetch failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const mediaType = guessMediaType(path, response.headers.get('content-type'));

  return { base64: buffer.toString('base64'), mediaType };
}
