import { addKstDays, formatKstISODate, getKstDateParts, getKstHours, getKstMinutes, getKstSeconds, kstWallToUtc } from '../kst.js';

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

export function attendanceFieldLabel(field) {
  return FIELD_LABEL[field] || field || '—';
}

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

function parseKstDateTime(value, workDate, earlierIso) {
  const text = blank(value);
  if (!text) return { skip: true };
  const full = text.match(
    /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/
  );
  if (full) {
    return {
      at: kstWallToUtc(
        Number(full[1]),
        Number(full[2]) - 1,
        Number(full[3]),
        Number(full[4]),
        Number(full[5]),
        Number(full[6] || 0)
      ).toISOString(),
    };
  }
  const clock = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!clock) return { error: '시각 형식이 아닙니다' };
  if (!workDate) return { error: '근무일이 없어 시각을 정할 수 없습니다' };
  let day = workDate;
  const minutes = Number(clock[1]) * 60 + Number(clock[2]);
  if (earlierIso) {
    const earlierMinutes = getKstHours(earlierIso) * 60 + getKstMinutes(earlierIso);
    if (minutes < earlierMinutes) {
      day = formatKstISODate(addKstDays(`${workDate}T12:00:00+09:00`, 1));
    }
  }
  const [year, month, date] = day.split('-').map(Number);
  return {
    at: kstWallToUtc(year, month - 1, date, Number(clock[1]), Number(clock[2]), Number(clock[3] || 0)).toISOString(),
  };
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
  const workers = directory || [];
  const byName = workers.filter((worker) => blank(worker?.worker_name) === name);
  if (byName.length === 1) return { workerName: blank(byName[0].worker_name) };
  const byDisplay = workers.filter((worker) => blank(worker?.display_name) === name);
  if (byDisplay.length > 1) return { error: '동일 표시명 중복' };
  if (byDisplay.length === 1) return { workerName: blank(byDisplay[0].worker_name) };
  return { error: '작업자를 찾을 수 없습니다' };
}

function readEditedFields(row, workDate, current) {
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
    const parsed = parseKstDateTime(row.추정출근, workDate, null);
    if (parsed.error) errors.push(`추정출근 ${parsed.error}`);
    else if (!parsed.skip) next.estimated_clock_in = parsed.at;
  }
  const clockInForOut = Object.prototype.hasOwnProperty.call(next, 'estimated_clock_in')
    ? next.estimated_clock_in
    : current?.estimated_clock_in;
  if (Object.prototype.hasOwnProperty.call(row, '추정퇴근')) {
    const parsed = parseKstDateTime(row.추정퇴근, workDate, clockInForOut);
    if (parsed.error) errors.push(`추정퇴근 ${parsed.error}`);
    else if (!parsed.skip) next.estimated_clock_out = parsed.at;
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

function matchDailyRow(excelRow, workDate, dailyById, dailyByKey, directory) {
  const rowId = blank(excelRow?.행ID);
  if (rowId) {
    const found = dailyById.get(rowId) || [];
    if (found.length !== 1) return { error: '행ID를 찾을 수 없습니다' };
    return { current: found[0], matchedBy: 'id' };
  }
  const workerId = blank(excelRow?.작업자ID);
  if (workerId) {
    const found = dailyByKey.get(`${workerId}\t${workDate}`) || [];
    if (found.length !== 1) {
      return { error: found.length ? '같은 근태 행이 여러 개입니다' : '저장된 근태 행이 없습니다' };
    }
    return { current: found[0], matchedBy: 'worker_id' };
  }
  const worker = resolveAttendanceWorkerName(excelRow?.작업자, directory);
  if (worker.error) return { error: worker.error };
  const found = dailyByKey.get(`${worker.workerName}\t${workDate}`) || [];
  if (found.length !== 1) {
    return { error: found.length ? '같은 근태 행이 여러 개입니다' : '저장된 근태 행이 없습니다' };
  }
  return { current: found[0], matchedBy: 'display_name' };
}

export function collectExcelImportKeys(excelRows) {
  const dates = new Set();
  const ids = new Set();
  for (const row of excelRows || []) {
    const workDate = parseYmd(row?.근무일);
    if (workDate) dates.add(workDate);
    const rowId = blank(row?.행ID);
    if (rowId) ids.add(rowId);
  }
  return { dates: [...dates], ids: [...ids] };
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
  const dailyById = new Map();
  for (const row of dailyRows || []) {
    const key = `${row?.worker_name || ''}\t${row?.work_date || ''}`;
    const list = dailyByKey.get(key) || [];
    list.push(row);
    dailyByKey.set(key, list);
    if (row?.id != null && row.id !== '') {
      const idKey = String(row.id);
      const idList = dailyById.get(idKey) || [];
      idList.push(row);
      dailyById.set(idKey, idList);
    }
  }

  const seen = new Set();
  const updates = [];
  const confirms = [];
  const errors = [];
  const preview = [];
  let skipped = 0;

  const pushError = (rowNumber, message, workerName = '', workDate = '') => {
    errors.push({ row: rowNumber, message });
    preview.push({
      row: rowNumber,
      status: 'error',
      workerName,
      workDate,
      changes: [],
      message,
    });
  };

  excelRows.forEach((excelRow, index) => {
    const rowNumber = index + 2;
    const workDateCell = parseYmd(excelRow?.근무일);
    if (!workDateCell && !blank(excelRow?.행ID)) {
      pushError(rowNumber, '근무일이 없습니다');
      return;
    }
    const matched = matchDailyRow(excelRow, workDateCell, dailyById, dailyByKey, directory);
    if (matched.error) {
      const edited = readEditedFields(excelRow || {}, workDateCell, null);
      const message =
        matched.error === '저장된 근태 행이 없습니다' && edited.errors.length
          ? edited.errors.join(', ')
          : matched.error;
      pushError(rowNumber, message, blank(excelRow?.작업자), workDateCell);
      return;
    }
    const current = matched.current;
    const workDate = workDateCell || current.work_date || '';
    const seenKey = String(current.id);
    if (seen.has(seenKey)) {
      pushError(rowNumber, '같은 작업자·근무일이 파일에 두 번 있습니다', current.worker_name, workDate);
      return;
    }
    seen.add(seenKey);
    const edited = readEditedFields(excelRow || {}, workDate, current);
    if (edited.errors.length) {
      pushError(rowNumber, edited.errors.join(', '), current.worker_name, workDate);
      return;
    }
    const changes = diffAttendanceFields(current, edited.next);
    if (!changes.length) {
      if (edited.confirm && current.reviewed !== true) {
        confirms.push({
          id: current.id,
          workerName: current.worker_name,
          workDate,
        });
        preview.push({
          row: rowNumber,
          status: 'confirm',
          workerName: current.worker_name,
          workDate,
          changes: [],
          message: '값 변경 없이 검수만 확정',
        });
      } else {
        skipped += 1;
        preview.push({
          row: rowNumber,
          status: 'skip',
          workerName: current.worker_name,
          workDate,
          changes: [],
          message: '변경 없음',
        });
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
    const originalRule = current.judgment_rationale?.rule || null;
    updates.push({
      id: current.id,
      workerName: current.worker_name,
      workDate,
      changes,
      originalRule,
      patch: {
        ...edited.next,
        reviewed: true,
        judgment_rationale: rationale,
      },
    });
    preview.push({
      row: rowNumber,
      status: 'update',
      workerName: current.worker_name,
      workDate,
      changes,
      message: '',
    });
  });

  return { updates, confirms, skipped, errors, preview };
}

export function storedEditValue(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function buildAttendanceEditLogs({
  companyId,
  attendanceId,
  workerName,
  workDate,
  changes,
  source,
  originalRule,
  editedBy,
  editedAt,
  batchId,
} = {}) {
  return (changes || []).map((change) => ({
    company_id: companyId,
    attendance_id: attendanceId,
    worker_name: workerName,
    work_date: workDate,
    field: change.field,
    old_value: storedEditValue(change.from),
    new_value: storedEditValue(change.to),
    source,
    original_rule: originalRule ?? null,
    edited_by: editedBy || null,
    edited_at: editedAt,
    batch_id: batchId,
  }));
}

export function summarizeAttendanceEdits(logs, dailyRows) {
  const list = logs || [];
  const rowIds = new Set();
  const workers = new Set();
  const fieldCounts = new Map();
  const ruleRows = new Map();
  const workerCounts = new Map();
  let dayToNight = 0;
  let nightToDay = 0;

  for (const log of list) {
    if (log?.attendance_id != null && log.attendance_id !== '') rowIds.add(String(log.attendance_id));
    if (log?.worker_name) workers.add(log.worker_name);
    const field = log?.field || '';
    fieldCounts.set(field, (fieldCounts.get(field) || 0) + 1);
    const rule = log?.original_rule || '(없음)';
    if (!ruleRows.has(rule)) ruleRows.set(rule, new Set());
    if (log?.attendance_id != null && log.attendance_id !== '') {
      ruleRows.get(rule).add(String(log.attendance_id));
    }
    if (log?.worker_name) {
      workerCounts.set(log.worker_name, (workerCounts.get(log.worker_name) || 0) + 1);
    }
    if (log?.field === 'shift' && log.old_value === 'day' && log.new_value === 'night') dayToNight += 1;
    if (log?.field === 'shift' && log.old_value === 'night' && log.new_value === 'day') nightToDay += 1;
  }

  const judgedByRule = new Map();
  for (const row of dailyRows || []) {
    const rule = row?.judgment_rationale?.rule || '(없음)';
    judgedByRule.set(rule, (judgedByRule.get(rule) || 0) + 1);
  }

  const byRule = [...ruleRows.entries()]
    .map(([rule, ids]) => {
      const editedRows = ids.size;
      const judgedRows = judgedByRule.get(rule) || 0;
      return {
        rule,
        editedRows,
        judgedRows,
        ratio: judgedRows > 0 ? editedRows / judgedRows : null,
      };
    })
    .sort((a, b) => b.editedRows - a.editedRows || a.rule.localeCompare(b.rule, 'ko'));

  const byField = [...fieldCounts.entries()]
    .map(([field, count]) => ({ field, label: attendanceFieldLabel(field), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));

  const topWorkers = [...workerCounts.entries()]
    .map(([workerName, count]) => ({ workerName, count }))
    .sort((a, b) => b.count - a.count || a.workerName.localeCompare(b.workerName, 'ko'))
    .slice(0, 10);

  const recent = [...list].sort((a, b) => String(b?.edited_at || '').localeCompare(String(a?.edited_at || '')));
  const topRule = byRule[0] || null;
  const lines = [
    `총 수정 ${list.length}건.`,
    `수정 행 ${rowIds.size}행, 작업자 ${workers.size}명.`,
    topRule
      ? `가장 많이 수정된 규칙은 ${topRule.rule}이며 ${topRule.editedRows}행입니다.`
      : '수정된 규칙이 없습니다.',
    `조 변경은 주간→야간 ${dayToNight}건, 야간→주간 ${nightToDay}건입니다.`,
  ];

  return {
    total: list.length,
    rowCount: rowIds.size,
    workerCount: workers.size,
    dayToNight,
    nightToDay,
    lines,
    byRule,
    byField,
    topWorkers,
    recent,
  };
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
        const labelName = attendanceFieldLabel(change.field);
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
