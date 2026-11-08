import { NextResponse } from 'next/server';
import { fetchAllPages } from '../../../../lib/attendance/pagedQuery';
import { getCompanyId } from '../../../../lib/company';
import { formatKstISODate, kstWallToUtc } from '../../../../lib/kst';
import { extractWorklog } from '../../../../lib/ocrExtract';
import {
  isValidSession,
  SESSION_COOKIE_NAME,
} from '../../../../lib/session';
import { createServiceRoleClient } from '../../../../lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Pro Fluid 일반 상한. Hobby는 300초가 최대라, 이 값을 넘기면 배포가 거절된다.
export const maxDuration = 800;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseYmd(value) {
  const match = String(value || '').match(YMD);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function parseIds(value) {
  if (value == null) return null;
  const ids = String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return ids;
}

/** created_at 오름차순 배열에서 limit건을 N/limit 간격으로 고른다. */
export function spreadSample(rows, limit) {
  if (!rows.length || limit < 1) return [];
  if (rows.length <= limit) return rows.slice();
  const step = rows.length / limit;
  const picked = [];
  for (let i = 0; i < limit; i += 1) {
    picked.push(rows[Math.floor(i * step)]);
  }
  return picked;
}

/**
 * GET /api/ocr/extract-preview?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=20
 * GET /api/ocr/extract-preview?ids=id1,id2
 * 관리자 세션만. 추출 결과는 응답으로만 돌려주고 DB에 쓰지 않는다.
 */
export async function GET(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!isValidSession(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const ids = parseIds(url.searchParams.get('ids'));
  if (ids && ids.length > MAX_LIMIT) {
    return NextResponse.json(
      { error: `ids는 ${MAX_LIMIT}개까지입니다.` },
      { status: 400 }
    );
  }
  if (ids && ids.length === 0) {
    return NextResponse.json({ error: 'ids가 비어 있습니다.' }, { status: 400 });
  }

  let startIso = null;
  let endIso = null;
  let limit = DEFAULT_LIMIT;
  const spread = !ids && url.searchParams.get('spread') === 'true';
  if (!ids) {
    const from = parseYmd(url.searchParams.get('from'));
    const to = parseYmd(url.searchParams.get('to'));
    if (!from || !to) {
      return NextResponse.json(
        { error: 'from과 to는 YYYY-MM-DD 여야 합니다.' },
        { status: 400 }
      );
    }

    const fromMs = kstWallToUtc(from.year, from.month - 1, from.day).getTime();
    const toMs = kstWallToUtc(to.year, to.month - 1, to.day).getTime();
    if (fromMs > toMs) {
      return NextResponse.json(
        { error: 'from이 to보다 늦습니다.' },
        { status: 400 }
      );
    }

    const limitRaw = url.searchParams.get('limit');
    if (limitRaw != null && limitRaw !== '') {
      const n = Number(limitRaw);
      if (!Number.isFinite(n) || n < 1) {
        return NextResponse.json(
          { error: 'limit은 1 이상의 정수여야 합니다.' },
          { status: 400 }
        );
      }
      limit = Math.min(Math.floor(n), MAX_LIMIT);
    }
    startIso = new Date(fromMs).toISOString();
    endIso = new Date(toMs + 24 * 60 * 60 * 1000).toISOString();
  }

  try {
    const companyId = await getCompanyId();
    const supabaseAdmin = createServiceRoleClient();

    const selectCols = 'id, image_url, created_at, worker_name';
    let data = [];
    let population = null;
    let truncated = false;
    if (ids) {
      const { data: idRows, error } = await supabaseAdmin
        .from('ocr_results')
        .select(selectCols)
        .eq('company_id', companyId)
        .or('is_deleted.eq.false,is_deleted.is.null')
        .in('id', ids)
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      data = idRows || [];
    } else if (spread) {
      const paged = await fetchAllPages(
        () =>
          supabaseAdmin
            .from('ocr_results')
            .select(selectCols)
            .eq('company_id', companyId)
            .or('is_deleted.eq.false,is_deleted.is.null')
            .gte('created_at', startIso)
            .lt('created_at', endIso),
        { timeColumn: 'created_at', label: 'ocr-extract-preview' }
      );
      if (paged.error) throw new Error(paged.error.message || 'ocr page read failed');
      population = paged.rows.length;
      truncated = paged.truncated;
      data = spreadSample(paged.rows, limit);
    } else {
      const { data: ranged, error } = await supabaseAdmin
        .from('ocr_results')
        .select(selectCols)
        .eq('company_id', companyId)
        .or('is_deleted.eq.false,is_deleted.is.null')
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      data = ranged || [];
    }

    const items = [];
    for (const row of data || []) {
      const started = Date.now();
      try {
        const result = await extractWorklog(
          row.image_url,
          formatKstISODate(row.created_at),
          { supabaseAdmin }
        );
        items.push({
          id: row.id,
          image_url: row.image_url,
          created_at: row.created_at,
          worker_name: row.worker_name ?? null,
          result,
          elapsed_ms: Date.now() - started,
        });
      } catch (err) {
        items.push({
          id: row.id,
          image_url: row.image_url,
          created_at: row.created_at,
          worker_name: row.worker_name ?? null,
          error: err?.message || String(err),
          elapsed_ms: Date.now() - started,
        });
      }
    }

    const response = NextResponse.json(items);
    if (population != null) {
      response.headers.set('X-Extract-Population', String(population));
      response.headers.set('X-Extract-Truncated', truncated ? '1' : '0');
    }
    return response;
  } catch (err) {
    console.error('[api/ocr/extract-preview]', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'extract preview failed' },
      { status: 500 }
    );
  }
}
