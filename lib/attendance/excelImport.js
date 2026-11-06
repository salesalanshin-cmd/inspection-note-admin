import { getKstDateParts, getKstHours, getKstMinutes, getKstSeconds, kstWallToUtc } from '../kst.js';

const MAX_CORRECTIONS = 30;

const SHIFT_TOKENS = new Map([
  ['주간', 'day'],
  ['주', 'day'],
  ['day', 'day'],
  ['야간', 'night'],
  ['야', 'night'],
  ['night', 'night'],
]);

const JUDGMENT_TOKENS = new Map([
  ['출근', 'present'],
  ['present', 'present'],
  ['미확인', 'unconfirmed'],
  ['unconfirmed', 'unconfirmed'],
]);

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatKstMinute(value) {
  if (value == null || value === '') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = getKstDateParts(date);
  return `${parts.year}-${pad(parts.month + 1)}-${pad(parts.day)} ${pad(getKstHours(date))}:${pad(getKstMinutes(date))}:${pad(getKstSeconds(date))}`;
}

function sameStoredValue(field, current, next) {
  if (field === 'estimated_clock_in' || field === 'estimated_clock_out') {
    return formatKstMinute(current).slice(0, 16) === formatKstMinute(next).slice(0, 16);
  }
  if (field === 'is_ot') return Boolean(current) === Boolean(next);
  return (current ?? null) === (next ?? null);
}

export function displayAttendanceValue(field, value) {
  if (field === 'shift') {
    if (value === 'day') return '주간';
    if (value === 'night') return '야간';
    return '미지정';
  }
  if (field === 'judgment') {
    if (value === 'present') return '출근';
    if (value === 'unconfirmed') return '미확인';
    return '—';
  }
  if (field === 'is_ot') return value ? 'Y' : 'N';
  if (!value) return '없음';
  return formatKstMinute(value);
}

const FIELD_LABEL = {
  shift: '조',
  judgment: '판정',
  estimated_clock_in: '추정출근',
  estimated_clock_out: '추정퇴근',
  is_ot: 'OT',
};

export function diffAttendanceFields(current, next) {
  const changes = [];
  for (const field of Object.keys(FIELD_LABEL)) {
    if (!Object.prototype.hasOwnProperty.call(next || {}, field)) continue;
    if (sameStoredValue(field, current?.[field], next[field])) continue;
    changes.push({
      field,
      from: current?.[field] ?? null,
      to: next[field] ?? null,
    });
  }
  return changes;
}

export function appendAttendanceCorrection(rationale, entry) {
  const base = rationale && typeof rationale === 'object' && !Array.isArray(rationale) ? { ...rationale } : {};
  if (!entry) return base;
  const prev = Array.isArray(base.corrections) ? base.corrections : [];
  return {
    ...base,
    corrections: [...prev, entry].slice(-MAX_CORRECTIONS),
  };
}

function blank(value) {
  return String(value ?? '').trim();
}

function parseYmd(value) {
  const text = blank(value).replace(/[./]/g, '-');
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
}

function parseKstDateTime(value) {
  const text = blank(value);
  if (!text) return { at: null };
  const match = text.match(
    /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/
  );
  if (!match) return { error: '시각 형식이 아닙니다' };
  const date = kstWallToUtc(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0)
  );
  return { at: date.toISOString() };
}

function parseShift(value) {
  const text = blank(value);
  if (!text) return { skip: true };
  const shift = SHIFT_TOKENS.get(text.toLowerCase());
  if (!shift) return { error: '조를 알 수 없습니다' };
  return { value: shift };
}

function parseJudgment(value) {
  const text = blank(value);
  if (!text) return { skip: true };
  const judgment = JUDGMENT_TOKENS.get(text.toLowerCase()) || JUDGMENT_TOKENS.get(text);
  if (!judgment) return { error: '판정을 알 수 없습니다' };
  return { value: judgment };
}

function parseYn(value) {
  const text = blank(value).toLowerCase();
  if (!text) return { skip: true };
  if (['y', 'yes', 'true', '1', '예'].includes(text)) return { value: true };
  if (['n', 'no', 'false', '0', '아니오'].includes(text)) return { value: false };
  return { error: 'Y/N이 아닙니다' };
}

export function resolveAttendanceWorkerName(label, directory) {
  const name = blank(label);
  if (!name) return { error: '작업자가 비어 있습니다' };
  const hits = new Set();
  for (const worker of directory || []) {
    const workerName = blank(worker?.worker_name);
    if (!workerName) continue;
    const displayName = blank(worker?.display_name);
    if (workerName === name || displayName === name) hits.add(workerName);
  }
  if (hits.size === 1) return { workerName: [...hits][0] };
  if (hits.size > 1) return { error: '작업자 이름이 여러 명과 겹칩니다' };
  return { error: '작업자를 찾을 수 없습니다' };
}

function readEditedFields(row) {
  const next = {};
  const errors = [];
  if (Object.prototype.hasOwnProperty.call(row, '조')) {
    const parsed = parseShift(row.조);
    if (parsed.error) errors.push(parsed.error);
    else if (!parsed.skip) next.shift = parsed.value;
  }
  if (Object.prototype.hasOwnProperty.call(row, '판정')) {
    const parsed = parseJudgment(row.판정);
    if (parsed.error) errors.push(parsed.error);
    else if (!parsed.skip) next.judgment = parsed.value;
  }
  if (Object.prototype.hasOwnProperty.call(row, '추정출근')) {
    const parsed = parseKstDateTime(row.추정출근);
    if (parsed.error) errors.push(`추정출근 ${parsed.error}`);
    else next.estimated_clock_in = parsed.at;
  }
  if (Object.prototype.hasOwnProperty.call(row, '추정퇴근')) {
    const parsed = parseKstDateTime(row.추정퇴근);
    if (parsed.error) errors.push(`추정퇴근 ${parsed.error}`);
    else next.estimated_clock_out = parsed.at;
  }
  if (Object.prototype.hasOwnProperty.call(row, 'OT')) {
    const parsed = parseYn(row.OT);
    if (parsed.error) errors.push(`OT ${parsed.error}`);
    else if (!parsed.skip) next.is_ot = parsed.value;
  }
  let confirm = false;
  if (Object.prototype.hasOwnProperty.call(row, '검수')) {
    const parsed = parseYn(row.검수);
    if (parsed.error) errors.push(`검수 ${parsed.error}`);
    else if (parsed.value === true) confirm = true;
  }
  return { next, errors, confirm };
}

/**
 * 다운로드한 기록 시트를 기존 attendance_daily 행에 맞춘다.
 * 값이 바뀌면 확정(reviewed)과 corrections 이력을 만든다. 없는 행은 만들지 않는다.
 */
export function applyAttendanceExcelImport({
  excelRows = [],
  dailyRows = [],
  directory = [],
  at = new Date().toISOString(),
} = {}) {
  const dailyByKey = new Map();
  for (const row of dailyRows || []) {
    const key = `${row?.worker_name || ''}\t${row?.work_date || ''}`;
    const list = dailyByKey.get(key) || [];
    list.push(row);
    dailyByKey.set(key, list);
  }

  const seen = new Set();
  const updates = [];
  const confirms = [];
  const errors = [];
  let skipped = 0;

  excelRows.forEach((excelRow, index) => {
    const rowNumber = index + 2;
    const workDate = parseYmd(excelRow?.근무일);
    if (!workDate) {
      errors.push({ row: rowNumber, message: '근무일이 없습니다' });
      return;
    }
    const worker = resolveAttendanceWorkerName(excelRow?.작업자, directory);
    if (worker.error) {
      errors.push({ row: rowNumber, message: worker.error });
      return;
    }
    const key = `${worker.workerName}\t${workDate}`;
    if (seen.has(key)) {
      errors.push({ row: rowNumber, message: '같은 작업자·근무일이 파일에 두 번 있습니다' });
      return;
    }
    seen.add(key);
    const edited = readEditedFields(excelRow || {});
    if (edited.errors.length) {
      errors.push({ row: rowNumber, message: edited.errors.join(', ') });
      return;
    }
    const found = dailyByKey.get(key) || [];
    if (found.length !== 1) {
      errors.push({
        row: rowNumber,
        message: found.length ? '같은 근태 행이 여러 개입니다' : '저장된 근태 행이 없습니다',
      });
      return;
    }
    const current = found[0];
    const changes = diffAttendanceFields(current, edited.next);
    if (!changes.length) {
      if (edited.confirm && current.reviewed !== true) {
        confirms.push({
          id: current.id,
          workerName: current.worker_name,
          workDate,
        });
      } else {
        skipped += 1;
      }
      return;
    }
    const entry = {
      at,
      source: 'excel',
      changes,
    };
    const rationale = appendAttendanceCorrection(current.judgment_rationale, entry);
    if (edited.next.shift) rationale.shift = edited.next.shift;
    rationale.rule = 'excel_import';
    updates.push({
      id: current.id,
      workerName: current.worker_name,
      workDate,
      changes,
      patch: {
        ...edited.next,
        reviewed: true,
        judgment_rationale: rationale,
      },
    });
  });

  return { updates, confirms, skipped, errors };
}

export function summarizeAttendanceCorrections(rows) {
  const counts = new Map();
  let total = 0;
  for (const row of rows || []) {
    const corrections = row?.judgment_rationale?.corrections;
    if (!Array.isArray(corrections)) continue;
    for (const entry of corrections) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      if (!changes.length) continue;
      total += 1;
      for (const change of changes) {
        const labelName = FIELD_LABEL[change.field] || change.field;
        const label =
          change.field === 'estimated_clock_in' || change.field === 'estimated_clock_out'
            ? `${labelName} 변경`
            : `${labelName} ${displayAttendanceValue(change.field, change.from)}→${displayAttendanceValue(change.field, change.to)}`;
        counts.set(label, (counts.get(label) || 0) + 1);
      }
    }
  }
  const patterns = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
  return { total, patterns };
}
