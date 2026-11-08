export default function DefectSummary({ defects }) {
  if (!defects?.length) return null;
  return (
    <section className="flex flex-col gap-3.5 rounded-[14px] bg-cardSurface px-[22px] py-5">
      <h2 className="text-[17px] font-bold text-cardInk">불량 촬영</h2>
      <div className="flex flex-col gap-2">
        {defects.map((item) => (
          <div key={item.subtype} className="flex items-baseline justify-between gap-4 text-[13px]">
            <span className="text-cardInk">{item.subtype}</span>
            <span className="tabular-nums font-bold text-cardInk">{item.count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
