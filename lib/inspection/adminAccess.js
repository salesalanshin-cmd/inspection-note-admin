/**
 * 설비·생산조건 점검 관리자 API용 허용 필드·입력 검증 (순수 함수).
 * company_id 는 서버 getCompanyId() 만 신뢰한다.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export const INSPECTION_KINDS = Object.freeze([
  'equipment_check',
  'production_condition',
]);

/** inspection_items INSERT 허용 컬럼 (company_id 제외 — 서버가 넣음) */
export const INSPECTION_ITEM_INSERT_FIELDS = Object.freeze([
  'process',
  'kind',
  'item_no',
  'title',
  'detail',
  'cycle',
  'method',
  'unit',
  'sort_order',
  'is_active',
]);

/** inspection_items UPDATE 허용 컬럼 */
export const INSPECTION_ITEM_PATCH_FIELDS = Object.freeze([
  'process',
  'kind',
  'item_no',
  'title',
  'detail',
  'cycle',
  'method',
  'unit',
  'sort_order',
  'is_active',
]);

const INSERT_SET = new Set(INSPECTION_ITEM_INSERT_FIELDS);
const PATCH_SET = new Set(INSPECTION_ITEM_PATCH_FIELDS);
const KIND_SET = new Set(INSPECTION_KINDS);

export function isYmd(value) {
  return YMD.test(String(value || '').trim());
}

export function isInspectionKind(value) {
  return KIND_SET.has(String(value || '').trim());
}

export function kindLabel(kind) {
  if (kind === 'equipment_check') return '설비일상점검';
  if (kind === 'production_condition') return '생산조건';
  return kind || '';
}

/**
 * 클라이언트가 보낸 company_id 는 무시하고 서버 companyId 만 쓴다.
 * @returns {{ ok: true, patch: object } | { ok: false, error: string }}
 */
export function pickInspectionItemPatch(input, serverCompanyId) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'patch 가 필요합니다.' };
  }
  if ('company_id' in input && input.company_id != null) {
    if (String(input.company_id) !== String(serverCompanyId)) {
      return { ok: false, error: 'company_id 는 서버에서만 정합니다.' };
    }
  }
  const patch = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'company_id' || key === 'id') continue;
    if (!PATCH_SET.has(key)) {
      return { ok: false, error: `허용되지 않은 필드: ${key}` };
    }
    patch[key] = value;
  }
  if (!Object.keys(patch).length) {
    return { ok: false, error: '변경할 필드가 없습니다.' };
  }
  if ('kind' in patch && !isInspectionKind(patch.kind)) {
    return { ok: false, error: 'kind 는 equipment_check 또는 production_condition 이어야 합니다.' };
  }
  if ('item_no' in patch) {
    const n = Number(patch.item_no);
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, error: 'item_no 는 1 이상의 정수여야 합니다.' };
    }
    patch.item_no = n;
  }
  if ('sort_order' in patch) {
    const n = Number(patch.sort_order);
    if (!Number.isInteger(n)) {
      return { ok: false, error: 'sort_order 는 정수여야 합니다.' };
    }
    patch.sort_order = n;
  }
  if ('is_active' in patch) {
    patch.is_active = Boolean(patch.is_active);
  }
  if ('process' in patch) {
    const process = String(patch.process ?? '').trim();
    if (!process) return { ok: false, error: 'process 가 필요합니다.' };
    patch.process = process;
  }
  if ('title' in patch) {
    const title = String(patch.title ?? '').trim();
    if (!title) return { ok: false, error: 'title 이 필요합니다.' };
    patch.title = title;
  }
  return { ok: true, patch };
}

/**
 * @returns {{ ok: true, row: object } | { ok: false, error: string }}
 */
export function pickInspectionItemInsert(input, serverCompanyId) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: '본문이 필요합니다.' };
  }
  if ('company_id' in input && input.company_id != null) {
    if (String(input.company_id) !== String(serverCompanyId)) {
      return { ok: false, error: 'company_id 는 서버에서만 정합니다.' };
    }
  }
  const row = { company_id: serverCompanyId };
  for (const [key, value] of Object.entries(input)) {
    if (key === 'company_id' || key === 'id') continue;
    if (!INSERT_SET.has(key)) {
      return { ok: false, error: `허용되지 않은 필드: ${key}` };
    }
    row[key] = value;
  }

  const process = String(row.process ?? '').trim();
  const title = String(row.title ?? '').trim();
  const kind = String(row.kind ?? '').trim();
  const itemNo = Number(row.item_no);
  if (!process) return { ok: false, error: 'process 가 필요합니다.' };
  if (!title) return { ok: false, error: 'title 이 필요합니다.' };
  if (!isInspectionKind(kind)) {
    return { ok: false, error: 'kind 는 equipment_check 또는 production_condition 이어야 합니다.' };
  }
  if (!Number.isInteger(itemNo) || itemNo <= 0) {
    return { ok: false, error: 'item_no 는 1 이상의 정수여야 합니다.' };
  }

  row.process = process;
  row.title = title;
  row.kind = kind;
  row.item_no = itemNo;
  row.sort_order =
    row.sort_order == null || row.sort_order === ''
      ? itemNo
      : Number(row.sort_order);
  if (!Number.isInteger(row.sort_order)) {
    return { ok: false, error: 'sort_order 는 정수여야 합니다.' };
  }
  row.is_active = row.is_active == null ? true : Boolean(row.is_active);
  for (const optional of ['detail', 'cycle', 'method', 'unit']) {
    if (optional in row && row[optional] != null) {
      const text = String(row[optional]).trim();
      row[optional] = text === '' ? null : text;
    }
  }
  return { ok: true, row };
}

/**
 * 헤더 행 + active 사진 수 → 목록 표시용 집계 (순수).
 * is_completed / completed_at 은 DB 값을 그대로 쓰고, 표시용 progress 만 만든다.
 */
export function summarizeInspectionHeader(header, activeCount) {
  const required = Number(header?.required_count) || 0;
  const active = Number(activeCount) || 0;
  const completed = Boolean(header?.is_completed);
  return {
    id: header?.id ?? null,
    work_date: header?.work_date ?? null,
    equipment_code: header?.equipment_code ?? null,
    equipment_name: header?.equipment_name ?? null,
    worker_name: header?.worker_name ?? null,
    process: header?.process ?? null,
    kind: header?.kind ?? null,
    part_no: header?.part_no ?? null,
    lot_no: header?.lot_no ?? null,
    required_count: required,
    active_count: active,
    is_completed: completed,
    completed_at: header?.completed_at ?? null,
    created_at: header?.created_at ?? null,
    status: completed ? 'completed' : 'incomplete',
    progress_label: `${active}/${required}`,
  };
}

/** update 결과 0행이면 실패 판정 */
export function assertUpdatedRow(data, notFoundMessage = '행을 찾지 못했습니다.') {
  if (data) return { ok: true, row: data };
  return { ok: false, error: notFoundMessage };
}
