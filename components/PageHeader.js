export default function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="shrink-0 border-b border-border bg-surface px-4 pb-6 pt-8 md:px-8">
      {eyebrow ? (
        <div className="text-xs font-medium text-accent mb-2">{eyebrow}</div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text">{title}</h1>
          {description ? <p className="text-sm text-muted mt-1">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
