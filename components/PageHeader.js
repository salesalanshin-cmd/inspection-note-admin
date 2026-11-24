export default function PageHeader({ eyebrow, title, description, actions, contentClassName = '' }) {
  return (
    <header className="shrink-0 border-b border-border bg-surface">
      <div className={`flex w-full flex-wrap items-end justify-between gap-x-6 gap-y-4 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 ${contentClassName}`}>
        <div className="min-w-0 max-w-full flex-auto break-keep [overflow-wrap:anywhere]">
          {eyebrow ? <div className="mb-1.5 text-xs font-bold tracking-wide text-accent">{eyebrow}</div> : null}
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-text sm:text-3xl 2xl:text-4xl">{title}</h1>
          {description ? <p className="mt-2 max-w-prose text-base leading-relaxed text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
