export default function PageHeader({ eyebrow, title, description }) {
  return (
    <div className="px-8 pt-8 pb-6 border-b border-border bg-surface">
      {eyebrow ? (
        <div className="text-xs font-medium text-accent mb-2">{eyebrow}</div>
      ) : null}
      <h1 className="text-2xl font-semibold text-text">{title}</h1>
      {description ? <p className="text-sm text-muted mt-1">{description}</p> : null}
    </div>
  );
}
