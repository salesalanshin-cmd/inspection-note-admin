const STAGES = [
  { key: 'first', label: '초품', doneKey: 'firstDone' },
  { key: 'middle', label: '중품', doneKey: 'middleDone' },
  { key: 'last', label: '종품', doneKey: 'lastDone' },
];

function dayNumber(date) {
  return String(Number(date.slice(-2)));
}

export default function InspectionCompliance({ inspection }) {
  const total = inspection.total || 0;
  return (
    <section className="flex flex-col gap-3.5 rounded-[14px] bg-cardSurface px-[22px] py-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[17px] font-bold text-cardInk">자주검사 수행</h2>
        <span className="text-xs text-cardSub">{total}일 기준</span>
      </div>
      {STAGES.map((stage) => {
        const done = inspection[stage.doneKey] || 0;
        const width = total ? Math.round((done / total) * 100) : 0;
        return (
          <div key={stage.key} className="grid grid-cols-[44px_1fr_56px] items-center gap-2.5">
            <span className="text-[13px] font-semibold text-cardInk">{stage.label}</span>
            <div className="h-2.5 rounded-full bg-cardLine">
              <div className="h-2.5 rounded-full bg-cardBrand" style={{ width: `${width}%` }} />
            </div>
            <span className="text-right text-[13px] tabular-nums text-cardInk">
              {done}/{total}
            </span>
          </div>
        );
      })}
      <div className="flex gap-1 overflow-x-auto pt-1.5">
        {inspection.days.map((day) => {
          const full = day.first && day.middle && day.last;
          const bars = [day.first, day.middle, day.last];
          return (
            <div key={day.date} className="flex min-w-[16px] flex-1 flex-col items-center gap-[3px]">
              {bars.map((done, index) => (
                <span
                  key={index}
                  className={`h-2 w-full rounded-sm ${done ? 'bg-cardBrand' : 'bg-cardLine'}`}
                />
              ))}
              <span
                className={`text-[10px] tabular-nums ${
                  full ? 'font-bold text-cardInk' : 'font-normal text-cardSub'
                }`}
              >
                {dayNumber(day.date)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-cardSub">
        위에서부터 초품 · 중품 · 종품. 빈 칸은 미실시, 굵은 날짜는 전 공정 준수.
      </div>
    </section>
  );
}
