import { getKstHours, getKstMinutes } from '../kst.js';

export const FLAG_SINGLE_SIGNAL = 'single_signal';

const TYPE_LABELS = {
  fives: '3정5S',
  frequent: '자주검사',
  defect: '불량',
  document: '문서스캔',
  lot_move: 'LOT이동',
  production: '실적',
  lot: 'LOT',
};

const TYPE_ORDER = ['fives', 'frequent', 'defect', 'document', 'lot_move', 'production', 'lot'];

function hm(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(getKstHours(date)).padStart(2, '0')}:${String(getKstMinutes(date)).padStart(2, '0')}`;
}

function policyHm(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function countsByType(rawSignals, bundles) {
  const counts = new Map();
  const raw = (rawSignals || []).filter((row) => row?.type);
  const source = raw.length
    ? raw.map((row) => row.type)
    : (bundles || []).flatMap((bundle) => {
        const size = Number(bundle?.bundleSize) || bundle?.rawAts?.length || 1;
        return Array.from({ length: size }, () => bundle.type);
      });
  for (const type of source) {
    if (!type) continue;
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  return counts;
}

function countLabel(counts) {
  const types = [...counts.keys()].sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a);
    const bi = TYPE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return String(a).localeCompare(String(b));
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return types
    .map((type) => `${TYPE_LABELS[type] || type} ${counts.get(type)}건`)
    .join(', ');
}

/**
 * 판정 값은 받지 않고, 신호 사실만으로 코멘트와 확인 플래그를 만든다.
 * 겹치면 우선순위 높은 것 최대 2개를 ' · '로 잇는다.
 * @returns {{ autoComment: string, flags: string[] }}
 */
export function buildAttendanceAutoComment({
  rawSignals = [],
  bundles = [],
  clockInAt = null,
  clockOutAt = null,
  lastSignalAt = null,
  estimatedClockIn = null,
  policyStartHm = '',
  existingText = '',
} = {}) {
  const counts = countsByType(rawSignals, bundles);
  const bundleCount = (bundles || []).filter((bundle) => bundle?.type || bundle?.at).length;
  const parts = [];

  if (!clockOutAt && lastSignalAt && counts.size) {
    parts.push({
      rank: 1,
      text: `퇴근 기록은 없지만 ${hm(lastSignalAt)}까지 활동 흔적(${countLabel(counts)})이 있어 그 무렵까지 근무한 것으로 보임`,
    });
  }

  const single = bundleCount === 1;
  if (single) {
    parts.push({
      rank: 2,
      text: '활동 기록이 1건뿐이라 출·퇴근 확인이 필요함',
      flag: FLAG_SINGLE_SIGNAL,
    });
  }

  const signalHm = hm(clockInAt);
  const startHm = policyHm(policyStartHm) || hm(estimatedClockIn);
  const clockInSentence =
    signalHm && startHm ? `출근 신호는 ${signalHm}이며 정책 시작 ${startHm}으로 보정` : '';
  const estimatedMs = estimatedClockIn ? new Date(estimatedClockIn).getTime() : NaN;
  const signalMs = clockInAt ? new Date(clockInAt).getTime() : NaN;
  const clockInAdjusted =
    Number.isFinite(estimatedMs) && Number.isFinite(signalMs) && estimatedMs < signalMs;
  if (
    clockInAdjusted &&
    clockInSentence &&
    !String(existingText || '').includes(clockInSentence)
  ) {
    parts.push({ rank: 3, text: clockInSentence });
  }

  const onlyDocument = counts.size === 1 && counts.has('document');
  if (onlyDocument) {
    parts.push({ rank: 5, text: '문서 스캔 기록만 있음' });
  }

  const chosen = parts.sort((a, b) => a.rank - b.rank).slice(0, 2);
  return {
    autoComment: chosen.map((part) => part.text).join(' · '),
    flags: [...new Set(chosen.map((part) => part.flag).filter(Boolean))],
  };
}

/** 확정 행 근거는 유지하고 autoComment와 single_signal만 바꾼다. */
export function applyAutoCommentToRationale(prevRationale, nextRationale) {
  if (!prevRationale || typeof prevRationale !== 'object' || Array.isArray(prevRationale)) {
    return nextRationale;
  }
  const prevFlags = Array.isArray(prevRationale.flags) ? prevRationale.flags : [];
  const kept = prevFlags.filter((flag) => flag !== FLAG_SINGLE_SIGNAL);
  const single = (nextRationale?.flags || []).includes(FLAG_SINGLE_SIGNAL)
    ? [FLAG_SINGLE_SIGNAL]
    : [];
  return {
    ...prevRationale,
    autoComment: nextRationale?.autoComment || '',
    flags: [...kept, ...single],
  };
}
