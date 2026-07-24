/**
 * 이행 여부 신호등
 * @param {{ done?: boolean, status?: 'done'|'pending'|'missed' }} props
 * done만 넘기면 기존처럼 완료/미실시 2색. status를 주면 3상태(완료·예정·미실시).
 */
export default function StatusDot({ done, status }) {
  const resolved = status || (done ? 'done' : 'missed');
  const colorClass =
    resolved === 'done'
      ? 'bg-good'
      : resolved === 'pending'
        ? 'bg-border'
        : 'bg-danger';
  const label =
    resolved === 'done' ? '완료' : resolved === 'pending' ? '예정' : '미실시';

  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${colorClass}`}
      title={label}
      aria-label={label}
    />
  );
}
