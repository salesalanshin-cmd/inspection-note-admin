export default function StatCard({ label, value, sub, tone = 'default' }) {
  const toneColor = {
    default: 'text-text',
    accent: 'text-accent',
    danger: 'text-danger',
    good: 'text-good',
    warn: 'text-warn',
    muted: 'text-muted',
  }[tone];

  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="text-sm font-semibold text-muted">{label}</div>
      <div className={`mt-2 text-2xl font-bold leading-tight tabular-nums sm:text-3xl ${toneColor}`}>{value}</div>
      {sub ? <div className="text-xs text-muted mt-1">{sub}</div> : null}
    </div>
  );
}
