import { formatCardDot } from '../../lib/attendance/card';

export default function AttendanceIssues({ issues, summary }) {
  const { confidence, mergedDays, reviewed, recordedDays } = summary;
  return (
    <section className="flex flex-col gap-3.5 rounded-[14px] bg-cardSurface px-[22px] py-5">
      <h2 className="text-[17px] font-bold text-cardInk">확인 필요</h2>
      <div className="flex flex-col gap-2.5">
        {issues.map((issue) => (
          <div key={`${issue.date}-${issue.message}`} className="grid grid-cols-[52px_1fr] gap-2.5 text-[13px] leading-relaxed">
            <span className="font-bold tabular-nums text-cardAmberInk">{formatCardDot(issue.date)}</span>
            <span className="text-cardInk">{issue.message}</span>
          </div>
        ))}
      </div>
      <div className="h-px bg-cardLine" />
      <div className="grid grid-cols-3 gap-2 text-xs text-cardSub">
        <div>
          신뢰도 높음/보통/낮음
          <div className="text-[15px] font-bold tabular-nums text-cardInk">
            {confidence.high} · {confidence.medium} · {confidence.low}
          </div>
        </div>
        <div>
          중복 촬영 병합
          <div className="text-[15px] font-bold tabular-nums text-cardInk">{mergedDays}일</div>
        </div>
        <div>
          관리자 검수
          <div className="text-[15px] font-bold tabular-nums text-cardInk">
            {reviewed} / {recordedDays}
          </div>
        </div>
      </div>
    </section>
  );
}
