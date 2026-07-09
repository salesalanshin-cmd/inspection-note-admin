/**
 * 3정5S 등 단일 이행 여부 신호등
 * @param {{ done: boolean }} props
 */
export default function StatusDot({ done }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${done ? 'bg-good' : 'bg-danger'}`}
      title={done ? '완료' : '미완료'}
      aria-label={done ? '완료' : '미완료'}
    />
  );
}
