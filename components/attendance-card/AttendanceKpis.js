function Kpi({ label, value, valueClass, suffix }) {
  return (
    <div className="rounded-[14px] bg-cardSurface px-[18px] py-4">
      <div className="text-[13px] text-cardSub">{label}</div>
      <div className={`text-[30px] font-bold tabular-nums ${valueClass}`}>
        {value}
        <span className="text-[15px] font-medium text-cardSub">{suffix}</span>
      </div>
    </div>
  );
}

export default function AttendanceKpis({ summary, inspection }) {
  const hours = Number.isFinite(summary.totalHours) ? summary.totalHours.toFixed(1) : '0.0';
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
      <Kpi
        label="출근"
        value={summary.presentDays}
        valueClass="text-cardBrand"
        suffix={` / ${summary.recordedDays}일`}
      />
      <Kpi
        label="미확인 (신호 없음)"
        value={summary.unknownDays}
        valueClass="text-cardInk"
        suffix="일"
      />
      <Kpi label="OT" value={summary.otCount} valueClass="text-cardAmberInk" suffix="회" />
      <Kpi label="추정 근무시간" value={hours} valueClass="text-cardInk" suffix="h" />
      <Kpi
        label="자주검사 전 공정 준수"
        value={inspection.fullCompliantDays}
        valueClass="text-cardInk"
        suffix={` / ${inspection.total}일`}
      />
    </section>
  );
}
