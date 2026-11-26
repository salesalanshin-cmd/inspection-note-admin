export const roundLabels = { open: '진행 중', confirmed: '확정', cancelled: '취소' };

const kstFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function inspectionTime(value) {
  const time = value ? new Date(value) : null;
  return time && Number.isFinite(time.getTime()) ? kstFormat.format(time) : '—';
}

export function roundInterval(header, now = Date.now()) {
  const start = Date.parse(header.created_at);
  const nextShift = Date.parse(header.work_date + 'T08:00:00+09:00') + 86400000;
  const end = header.confirmed_at ? Date.parse(header.confirmed_at) : Math.min(now, nextShift);
  return { from: new Date(start).toISOString(), to: new Date(Math.max(start, end)).toISOString() };
}

export function lotOverlapsRound(lot, header, now = Date.now()) {
  if (!lot || lot.equipmentId !== header.equipment_code) return false;
  const { from, to } = roundInterval(header, now);
  return Date.parse(lot.startAt) <= Date.parse(to)
    && (lot.endAt ? Date.parse(lot.endAt) : now) >= Date.parse(from);
}
