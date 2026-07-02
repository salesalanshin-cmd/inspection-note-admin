export default function StatCard({ label, value, sub, tone = 'default' }) {
  const toneColor = {
    default: 'text-text',
    accent: 'text-accent',
    danger: 'text-danger',
    good: 'text-good',
  }[tone];

  return (
    <div className="relative bg-surface border border-border rounded-sm p-5 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px] gauge-tick opacity-60" />
      <div className="text-[11px] tracking-[0.2em] text-muted font-mono uppercase">{label}</div>
      <div className={`font-display text-3xl font-semibold mt-2 ${toneColor}`}>{value}</div>
      {sub ? <div className="text-xs text-muted mt-1">{sub}</div> : null}
    </div>
  );
}
