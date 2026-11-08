export default function SignOffFooter() {
  return (
    <footer className="flex flex-wrap items-end justify-between gap-6">
      <p className="m-0 max-w-[520px] text-xs leading-relaxed text-cardSub">
        출퇴근 시각은 검사노트 앱 촬영 신호(자주검사 · 3정5S · 불량)의 최초·최종 시각으로
        추정했습니다. 퇴근 신호가 정규 퇴근 이후면 정규 퇴근 시각으로 보고 OT로 표시합니다.
      </p>
      <div className="flex gap-3">
        <div className="h-16 w-[130px] rounded-lg border border-cardLine bg-cardSurface p-2 text-[11px] text-cardSub">
          작업자 확인
        </div>
        <div className="h-16 w-[130px] rounded-lg border border-cardLine bg-cardSurface p-2 text-[11px] text-cardSub">
          관리자 검수
        </div>
      </div>
    </footer>
  );
}
