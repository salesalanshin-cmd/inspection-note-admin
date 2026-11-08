import { getKstDay } from '../../lib/kst';
import { kstNoon } from '../../lib/attendance/card';

const WEEKDAYS = [
  { label: '월', className: 'text-cardSub' },
  { label: '화', className: 'text-cardSub' },
  { label: '수', className: 'text-cardSub' },
  { label: '목', className: 'text-cardSub' },
  { label: '금', className: 'text-cardSub' },
  { label: '토', className: 'text-cardBrand' },
  { label: '일', className: 'text-cardSunday' },
];

const CONFIDENCE_GLYPH = { high: '●', medium: '◐', low: '○' };

const HATCHED =
  'bg-[repeating-linear-gradient(135deg,theme(colors.cardLine)_0_2px,theme(colors.cardSoft)_2px_7px)]';

function dateNumberClass(date) {
  const weekday = getKstDay(kstNoon(date));
  if (weekday === 0) return 'text-cardSunday';
  if (weekday === 6) return 'text-cardBrand';
  return 'text-cardInk';
}

function cellClass(status) {
  if (status === 'present') return 'border-[1.5px] border-cardBrand bg-cardSurface';
  if (status === 'unknown') return `border border-cardLine ${HATCHED}`;
  if (status === 'pending_recalc') return 'border border-dashed border-cardAmber bg-cardAmberSoft';
  if (status === 'future') return 'border border-cardLine bg-cardSoft opacity-60';
  return 'border border-cardLine bg-cardSoft';
}

function DayCell({ day }) {
  const number = Number(day.date.slice(-2));
  const glyph = CONFIDENCE_GLYPH[day.confidence] || '';
  return (
    <div className={`flex h-[92px] flex-col gap-1 rounded-lg p-2 ${cellClass(day.status)}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[13px] font-bold tabular-nums ${dateNumberClass(day.date)}`}>
          {number}
        </span>
        {day.ot ? (
          <span className="rounded bg-cardAmber px-1.5 py-px text-[10px] font-bold text-cardInk">
            OT
          </span>
        ) : null}
      </div>
      {day.status === 'present' ? (
        <>
          <div className="text-xs font-bold text-cardBrand">출근</div>
          <div className="text-xs tabular-nums text-cardInk">
            {day.inAt || '?'}–{day.outAt || '?'}
          </div>
          <div className="text-[11px] tabular-nums text-cardSub">
            {glyph} 신호 {day.signalCount}
          </div>
        </>
      ) : null}
      {day.status === 'unknown' ? (
        <>
          <div className="text-xs font-semibold text-cardSub">미확인</div>
          <div className="text-xs text-cardSub">신호 없음</div>
        </>
      ) : null}
      {day.status === 'off' ? <div className="text-xs text-cardSub">휴무</div> : null}
      {day.status === 'pending_recalc' ? (
        <div className="text-xs font-bold text-cardAmberInk">재계산 대기</div>
      ) : null}
    </div>
  );
}

export default function AttendanceCalendar({ days }) {
  const first = days[0]?.date;
  const leading = first ? (getKstDay(kstNoon(first)) + 6) % 7 : 0;

  return (
    <section className="flex flex-col gap-3.5 rounded-[14px] bg-cardSurface px-[22px] py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[17px] font-bold text-cardInk">일별 근태</h2>
        <div className="flex flex-wrap items-center gap-4 text-xs text-cardSub">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-cardBrand" />
            출근
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-[3px] bg-[repeating-linear-gradient(135deg,theme(colors.cardLine)_0_2px,theme(colors.cardSoft)_2px_5px)]`}
            />
            미확인
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded bg-cardAmber px-1.5 py-px text-[10px] font-bold text-cardInk">
              OT
            </span>
            연장
          </span>
          <span>●◐○ 신뢰도 높음·보통·낮음</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-7 gap-1.5">
          {WEEKDAYS.map((day) => (
            <div key={day.label} className={`px-1 text-xs font-semibold ${day.className}`}>
              {day.label}
            </div>
          ))}
          {Array.from({ length: leading }, (_, index) => (
            <div key={`blank-${index}`} />
          ))}
          {days.map((day) => (
            <DayCell key={day.date} day={day} />
          ))}
        </div>
      </div>
    </section>
  );
}
