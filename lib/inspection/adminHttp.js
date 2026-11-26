import { NextResponse } from 'next/server';
import { getWorkDateForRecord } from '../analytics.js';
import { getCompanyCode, getCompanyId } from '../company.js';
import { isValidSession, SESSION_COOKIE_NAME } from '../session.js';
import { createServiceRoleClient } from '../supabaseAdmin.js';
import { lotOverlapsRound, roundInterval } from './rounds.js';

import {
  assertUpdatedRow,
  isInspectionKind,
  isYmd,
  pickInspectionItemInsert,
  pickInspectionItemPatch,
  summarizeInspectionHeader,
} from './adminAccess.js';

const HEADER_FIELDS = 'id, company_id, work_date, equipment_code, worker_name, process, kind, part_no, lot_no, required_count, is_completed, completed_at, created_at, round_no, round_status, confirmed_at, confirmed_by';

export function requireInspectionAdmin(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!isValidSession(token)) return null;
  return true;
}

export async function withInspectionAdmin(request, handler) {
  if (!requireInspectionAdmin(request)) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  try {
    const supabase = createServiceRoleClient();
    const companyId = await getCompanyId();
    const body = await handler({ request, supabase, companyId });
    if (body instanceof NextResponse) return body;
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const status = Number(err?.status) || 500;
    if (status >= 500) {
      // eslint-disable-next-line no-console
      console.error('[api/inspection/admin]', err?.message || err);
    }
    return NextResponse.json(
      { error: err?.message || '요청에 실패했습니다.' },
      { status }
    );
  }
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/** RPC inspection_work_date() 우선, 실패 시 앱 KST 08:00 규칙 */
export async function resolveInspectionWorkDate(supabase, rawDate) {
  const trimmed = String(rawDate || '').trim();
  if (trimmed) {
    if (!isYmd(trimmed)) throw httpError('date 는 YYYY-MM-DD 형식이어야 합니다.');
    return trimmed;
  }
  const { data, error } = await supabase.rpc('inspection_work_date');
  if (!error && data) {
    const text = String(data).slice(0, 10);
    if (isYmd(text)) return text;
  }
  return getWorkDateForRecord(new Date());
}

async function countActivePhotosByHeader(supabase, companyId, headerIds) {
  const counts = new Map();
  for (const id of headerIds) counts.set(String(id), 0);
  if (!headerIds.length) return counts;

  for (let i = 0; i < headerIds.length; i += 200) {
    const chunk = headerIds.slice(i, i + 200);
    // A later checklist revision must not remove a photo from its original round.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .from('inspection_photos')
        .select('header_id')
        .in('header_id', chunk)
        .eq('status', 'active')
        .eq('company_id', companyId)
        .order('id').range(offset, offset + 499);
      if (error) throw new Error(error.message);
      for (const row of data || []) {
        const key = String(row.header_id);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      if (!data || data.length < 500) break;
    }
  }
  return counts;
}

async function loadEquipmentNameMap(supabase, companyId, codes) {
  const unique = [...new Set(codes.map((c) => String(c || '').trim()).filter(Boolean))];
  const map = new Map();
  if (!unique.length) return map;

  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data, error } = await supabase
      .from('equipment')
      .select('external_code, name')
      .eq('company_id', companyId)
      .in('external_code', chunk);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      if (row.external_code) map.set(String(row.external_code), row.name || null);
    }
  }
  return map;
}

/** GET /api/inspection/headers */
export async function queryInspectionHeaders(supabase, companyId, searchParams) {
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const range = Boolean(from || to);
  const date = range ? null : await resolveInspectionWorkDate(supabase, searchParams.get('date'));
  const kind = range ? 'production_condition' : String(searchParams.get('kind') || 'equipment_check').trim();
  const equipment = String(searchParams.get('equipment') || '').trim();

  if (!isInspectionKind(kind)) {
    throw httpError('kind 는 equipment_check 또는 production_condition 이어야 합니다.');
  }

  const start = Date.parse(from), end = Date.parse(to);
  if (range && (!equipment || !Number.isFinite(start) || !Number.isFinite(end) || start > end))
    throw httpError('LOT 설비와 시작·종료 시각을 확인해주세요.');
  const headers = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from('inspection_headers').select(HEADER_FIELDS)
      .eq('company_id', companyId).eq('kind', kind);
    if (equipment) query = query.eq('equipment_code', equipment);
    if (range) {
      query = query.lte('created_at', new Date(end).toISOString())
        .or('confirmed_at.is.null,confirmed_at.gte.' + new Date(start).toISOString());
    } else query = query.eq('work_date', date);
    const { data, error } = await query.order('equipment_code').order('work_date')
      .order('round_no').order('id').range(offset, offset + 499);
    if (error) throw new Error(error.message);
    const lot = { equipmentId: equipment, startAt: from, endAt: to };
    headers.push(...(range ? data.filter(h => lotOverlapsRound(lot,h)) : data));
    if (data.length < 500) break;
  }
  const counts = await countActivePhotosByHeader(
    supabase,
    companyId,
    headers.map((h) => h.id)
  );
  const names = await loadEquipmentNameMap(
    supabase,
    companyId,
    headers.map((h) => h.equipment_code)
  );

  const rows = headers.map((header) =>
    summarizeInspectionHeader(
      {
        ...header,
        equipment_name: names.get(String(header.equipment_code)) || null,
      },
      counts.get(String(header.id)) || 0
    )
  );

  return { date, kind, rows };
}

/** GET /api/inspection/headers/[id] */
export async function queryInspectionHeaderDetail(supabase, companyId, headerId) {
  const id = String(headerId || '').trim();
  if (!id) throw httpError('id 가 필요합니다.');

  const { data: header, error: headerError } = await supabase
    .from('inspection_headers')
    .select(HEADER_FIELDS + ',item_ids')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (headerError) throw new Error(headerError.message);
  if (!header) throw httpError('헤더를 찾지 못했습니다.', 404);

  const names = await loadEquipmentNameMap(supabase, companyId, [header.equipment_code]);
  header.equipment_name = names.get(String(header.equipment_code)) || null;

  let itemQuery = supabase
    .from('inspection_items')
    .select('id, item_no, title, detail, sort_order, is_active, process, kind')
    .eq('company_id', companyId)
    .eq('kind', header.kind);
  itemQuery = Array.isArray(header.item_ids) ? itemQuery.in('id', header.item_ids)
    : itemQuery.eq('process', header.process).eq('is_active', true);
  const { data: items, error: itemsError } = header.item_ids?.length === 0 ? {data: []} : await itemQuery
    .order('sort_order', { ascending: true })
    .order('item_no', { ascending: true });
  if (itemsError) throw new Error(itemsError.message);

  const itemIds = (items || []).map((item) => item.id);
  const photosByItem = new Map();
  const replacedByItem = new Map();

  if (itemIds.length) {
    const { data: photos, error: photosError } = await supabase
      .from('inspection_photos')
      .select('id, item_id, photo_url, captured_at, status, worker_name')
      .eq('header_id', id)
      .eq('company_id', companyId)
      .in('item_id', itemIds);
    if (photosError) throw new Error(photosError.message);

    for (const photo of photos || []) {
      const key = String(photo.item_id);
      if (photo.status === 'active') {
        photosByItem.set(key, {
          id: photo.id,
          photo_url: photo.photo_url,
          captured_at: photo.captured_at,
          worker_name: photo.worker_name,
        });
      } else if (photo.status === 'replaced') {
        replacedByItem.set(key, (replacedByItem.get(key) || 0) + 1);
      }
    }
  }

  const activeCount = [...photosByItem.keys()].length;
  const summary = summarizeInspectionHeader(header, activeCount);

  const { data: audit, error: auditError } = await supabase.from('inspection_round_audit')
    .select('id,action,old_part_no,new_part_no,old_lot_no,new_lot_no,reason,actor,created_at')
    .eq('header_id', id).order('created_at', { ascending: false });
  if (auditError) throw new Error(auditError.message);
  return {
    header: summary,
    audit: audit || [],
    items: (items || []).map((item) => {
      const key = String(item.id);
      return {
        id: item.id,
        item_no: item.item_no,
        title: item.title,
        detail: item.detail,
        sort_order: item.sort_order,
        active_photo: photosByItem.get(key) || null,
        replaced_count: replacedByItem.get(key) || 0,
      };
    }),
  };
}

export async function changeInspectionRound(supabase, companyId, headerId, body) {
  const reason = String(body?.reason || '').trim(), actor = String(body?.actor || '').trim();
  if (!reason || reason.length > 500 || !actor || actor.length > 80)
    throw httpError('수정자와 사유를 입력해주세요.');
  const { data: h, error } = await supabase.from('inspection_headers').select(HEADER_FIELDS)
    .eq('id', headerId).eq('company_id', companyId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!h) throw httpError('점검 회차를 찾을 수 없습니다.', 404);
  const p = { p_company_id: companyId, p_header_id: h.id, p_reason: reason, p_actor: actor,
    p_action: body.action, p_expected: body.expected || null, p_part_no: null, p_lot: null };
  if (body.action === 'correct') {
    if (getCompanyCode() !== 'dkmetal') throw httpError('이 회사의 MES LOT 연결이 설정되지 않았습니다.', 403);
    if (!body.lotId || h.round_status === 'cancelled') throw httpError('적용할 LOT와 회차 상태를 확인해주세요.');
    const { fetchMesReview } = await import('../mesProductionReview.js');
    const matches = await fetchMesReview({ action: 'lots', equipmentId: h.equipment_code, ...roundInterval(h) });
    const lot = matches.find(row => row.lotId === body.lotId && lotOverlapsRound(row, h));
    if (!lot?.itemCode) throw httpError('같은 설비·시간대에 일치하는 MES LOT와 품번을 찾지 못했습니다.', 409);
    Object.assign(p, { p_part_no: lot.itemCode, p_lot: lot.lotId });
  } else if (body.action === 'cancel') {
    if (h.round_status !== 'confirmed') throw httpError('확정된 회차만 취소할 수 있습니다.', 409);
  } else throw httpError('지원하지 않는 회차 작업입니다.');
  const result = await supabase.rpc('admin_apply_inspection_round_change', p);
  if (result.error) throw httpError(result.error.message, 409);
  return { ok: true };
}

/** GET /api/inspection/items */
export async function queryInspectionItems(supabase, companyId, searchParams) {
  const process = String(searchParams.get('process') || '').trim();
  const kind = String(searchParams.get('kind') || '').trim();
  const includeInactive = searchParams.get('includeInactive') === '1'
    || searchParams.get('includeInactive') === 'true';

  let query = supabase
    .from('inspection_items')
    .select(
      'id, company_id, process, kind, item_no, title, detail, cycle, method, unit, sort_order, is_active, created_at'
    )
    .eq('company_id', companyId)
    .order('process', { ascending: true })
    .order('kind', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('item_no', { ascending: true });

  if (process) query = query.eq('process', process);
  if (kind) {
    if (!isInspectionKind(kind)) {
      throw httpError('kind 는 equipment_check 또는 production_condition 이어야 합니다.');
    }
    query = query.eq('kind', kind);
  }
  if (!includeInactive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { rows: data || [] };
}

/** POST /api/inspection/items */
export async function createInspectionItem(supabase, companyId, body) {
  const picked = pickInspectionItemInsert(body || {}, companyId);
  if (!picked.ok) throw httpError(picked.error);

  const { data, error } = await supabase
    .from('inspection_items')
    .insert(picked.row)
    .select(
      'id, company_id, process, kind, item_no, title, detail, cycle, method, unit, sort_order, is_active, created_at'
    )
    .single();
  if (error) throw httpError(error.message, 400);
  return { ok: true, row: data };
}

/** PATCH /api/inspection/items */
export async function updateInspectionItem(supabase, companyId, body) {
  const id = String(body?.id || '').trim();
  if (!id) throw httpError('id 가 필요합니다.');

  const picked = pickInspectionItemPatch(body?.patch || {}, companyId);
  if (!picked.ok) throw httpError(picked.error);

  const { data, error } = await supabase
    .from('inspection_items')
    .update(picked.patch)
    .eq('id', id)
    .eq('company_id', companyId)
    .select(
      'id, company_id, process, kind, item_no, title, detail, cycle, method, unit, sort_order, is_active, created_at'
    )
    .maybeSingle();
  if (error) throw httpError(error.message, 400);

  const checked = assertUpdatedRow(data);
  if (!checked.ok) throw httpError(checked.error, 404);
  return { ok: true, row: checked.row };
}
