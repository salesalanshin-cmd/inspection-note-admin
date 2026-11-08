import {
  formatCardDot,
  formatCardMonth,
  groupConsecutiveDates,
} from '../../lib/attendance/card';

function rangeLabel(from, to) {
  if (!from) return '';
  if (!to || from === to) return formatCardDot(from);
  return `${formatCardDot(from)} – ${formatCardDot(to)}`;
}

export default function AttendanceCardHeader({ card }) {
  const { worker, month, coveredRange, pendingRecalcDates } = card;
  const pending = groupConsecutiveDates(pendingRecalcDates);
  const shiftText = `${worker.shift}조 ${worker.shiftStart}–${worker.shiftEnd}`;

  return (
    <header className="flex flex-wrap items-end justify-between gap-6">
      <div className="flex flex-col gap-1.5">
        <div className="text-[13px] font-semibold tracking-wide text-cardBrand">
          근태 기록 카드 · {formatCardMonth(month)}
        </div>
        <div className="flex flex-wrap items-baseline gap-3.5">
          <h1 className="text-[40px] font-extrabold tracking-tight text-cardInk">{worker.name}</h1>
          <span className="rounded-full bg-cardBrand px-2.5 py-1 text-sm font-semibold text-cardOnBrand">
            {shiftText}
          </span>
          <span className="text-sm text-cardSub">사번 —</span>
        </div>
      </div>
      <div className="text-right text-[13px] leading-relaxed text-cardSub">
        <div>
          집계 기간{' '}
          <span className="tabular-nums text-cardInk">
            {rangeLabel(coveredRange.from, coveredRange.to)}
          </span>
        </div>
        {pending.map((group) => (
          <div key={`${group.from}-${group.to}`}>
            <span className="tabular-nums">{rangeLabel(group.from, group.to)}</span>{' '}
            <b className="text-cardAmberInk">재계산 대기</b>
          </div>
        ))}
      </div>
    </header>
  );
}
