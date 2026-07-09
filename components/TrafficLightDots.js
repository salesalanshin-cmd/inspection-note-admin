/**
 * 자주검사 초·중·종 3단계 신호등 (가로 3구슬)
 * @param {{ stages: Array<{ label: string, done: boolean }> }} props
 */
export default function TrafficLightDots({ stages }) {
  return (
    <div className="inline-flex items-center gap-1" role="img" aria-label="자주검사 단계별 현황">
      {stages.map((stage) => (
        <span
          key={stage.label}
          title={stage.label}
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            stage.done ? 'bg-good' : 'bg-danger'
          }`}
          aria-label={`${stage.label} ${stage.done ? '완료' : '미실시'}`}
        />
      ))}
    </div>
  );
}
