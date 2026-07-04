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
    <div className="bg-surface rounded-xl shadow-card p-5">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`text-3xl font-semibold mt-2 ${toneColor}`}>{value}</div>
      {sub ? <div className="text-xs text-muted mt-1">{sub}</div> : null}
    </div>
  );
}
