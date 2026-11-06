/** 작업자 추가·일괄 등록에 쓰는 순수 함수. 화면과 테스트가 같이 씁니다. */

export const NATIONALITY_PRESETS = ['한국', '베트남', '태국', '우즈베키스탄', '네팔', '캄보디아'];

export const MSG_ALREADY_REGISTERED = '이미 등록된 작업자입니다';
export const MSG_RESTORE_CONFIRM = '퇴사 처리된 작업자입니다. 복원할까요?';
export const MSG_NATIONALITY_UNSET = '국적 미설정: 야간 판정이 부정확할 수 있음';
export const MSG_KOREAN_NIGHT = '내국인은 기본 교대가 야간이어야 야간으로 판정됨';

const SHIFT_TOKENS = new Map([
  ['주간', 'day'],
  ['주', 'day'],
  ['day', 'day'],
  ['야간', 'night'],
  ['야', 'night'],
  ['night', 'night'],
]);

export function nullIfBlank(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

/** 앞뒤·사이 공백과 대소문자만 다른 이름을 같은 사람으로 봅니다. */
export function normalizeWorkerNameKey(name) {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function parseShiftToken(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { shift: null, error: null };
  const shift = SHIFT_TOKENS.get(trimmed.toLowerCase());
  if (!shift) return { shift: null, error: '교대 표기를 알 수 없습니다' };
  return { shift, error: null };
}

export function shiftLabel(shift) {
  if (shift === 'day') return '주간';
  if (shift === 'night') return '야간';
  return '미지정';
}

/**
 * 한 줄에 이름, 국적, 교대, 공정. 탭이 있으면 탭, 없으면 쉼표.
 * 뒤 항목은 생략 가능. 빈 줄은 버립니다.
 */
export function parseWorkerPaste(text) {
  const rows = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = (line.includes('\t') ? line.split('\t') : line.split(',')).map((part) =>
      String(part ?? '').trim()
    );
    const [name = '', nationalityRaw = '', shiftRaw = '', processRaw = ''] = parts;
    const parsedShift = parseShiftToken(shiftRaw);
    let error = null;
    if (!name) error = '이름이 비어 있습니다';
    else if (parsedShift.error) error = parsedShift.error;
    rows.push({
      name,
      nationality: nullIfBlank(nationalityRaw),
      shift: parsedShift.error ? null : parsedShift.shift,
      process: nullIfBlank(processRaw),
      error,
    });
  }
  return rows;
}

function indexDirectory(directoryRows) {
  const map = new Map();
  for (const row of directoryRows || []) {
    const key = normalizeWorkerNameKey(row?.worker_name);
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || (prev.removed && row?.removed !== true)) map.set(key, row);
  }
  return map;
}

/**
 * @returns {Array<{ name, nationality, shift, process, error, status: 'new'|'duplicate'|'restore'|'error', message: string|null, existing: object|null }>}
 */
export function classifyWorkerImport(parsedRows, directoryRows) {
  const index = indexDirectory(directoryRows);
  const seen = new Set();
  return (parsedRows || []).map((row) => {
    if (row?.error || !nullIfBlank(row?.name)) {
      return {
        ...row,
        name: row?.name || '',
        status: 'error',
        message: row?.error || '이름이 비어 있습니다',
        existing: null,
      };
    }
    const key = normalizeWorkerNameKey(row.name);
    if (seen.has(key)) {
      return {
        ...row,
        status: 'duplicate',
        message: index.has(key) ? MSG_ALREADY_REGISTERED : '같은 붙여넣기에 이미 있습니다',
        existing: index.get(key) || null,
      };
    }
    seen.add(key);
    const existing = index.get(key);
    if (!existing) {
      return { ...row, status: 'new', message: null, existing: null };
    }
    if (existing.removed === true) {
      return { ...row, status: 'restore', message: MSG_RESTORE_CONFIRM, existing };
    }
    return { ...row, status: 'duplicate', message: MSG_ALREADY_REGISTERED, existing };
  });
}

/** 복원 시 비어 있지 않은 국적·교대·공정만 덮어씁니다. */
export function buildRestorePatch(row) {
  const patch = { removed: false };
  const nationality = nullIfBlank(row?.nationality);
  const process = nullIfBlank(row?.process);
  if (nationality) patch.nationality = nationality;
  if (row?.shift === 'day' || row?.shift === 'night') patch.default_shift = row.shift;
  if (process) patch.process = process;
  return patch;
}

export function workerAddWarnings({ nationality, shift } = {}) {
  const warnings = [];
  if (!nullIfBlank(nationality)) warnings.push(MSG_NATIONALITY_UNSET);
  const nat = nullIfBlank(nationality);
  if ((nat === '한국' || nat === '대한민국') && shift === 'night') {
    warnings.push(MSG_KOREAN_NIGHT);
  }
  return warnings;
}

/** 활성(removed·excluded 아님)이고 국적 또는 교대가 비어 있으면 true. 디렉터리 행이 없어도 미설정. */
export function isWorkerSetupIncomplete(row) {
  if (row?.removed || row?.excluded) return false;
  const nationality = nullIfBlank(row?.nationality);
  const shift = row?.default_shift === 'day' || row?.default_shift === 'night' ? row.default_shift : null;
  return !nationality || !shift;
}

/** 신규 insert. 메모는 NOT NULL이라 비우면 빈 문자열, 나머지 미지정은 null. */
export function buildNewWorkerRow(fields, companyId) {
  const shift = fields?.shift === 'day' || fields?.shift === 'night' ? fields.shift : null;
  return {
    worker_name: String(fields?.name ?? '').trim(),
    company_id: companyId,
    excluded: false,
    note: nullIfBlank(fields?.note) ?? '',
    default_shift: shift,
    handles_frequent_check: true,
    handles_fives: true,
    handles_documents: true,
    handles_defects: true,
    phone_number: '',
    display_name: nullIfBlank(fields?.displayName),
    nationality: nullIfBlank(fields?.nationality),
    role: fields?.role || 'inspector',
    lang: 'ko',
    process: nullIfBlank(fields?.process),
    default_equipment_id: null,
  };
}

export function nationalityOptions(directoryRows) {
  const extras = [];
  const seen = new Set(NATIONALITY_PRESETS);
  for (const row of directoryRows || []) {
    const value = nullIfBlank(row?.nationality);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    extras.push(value);
  }
  extras.sort((a, b) => a.localeCompare(b, 'ko'));
  return [...NATIONALITY_PRESETS, ...extras];
}
