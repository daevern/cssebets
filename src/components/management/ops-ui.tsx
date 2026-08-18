/**
 * Management operator design system — Google Analytics / Power BI style.
 * Light, spacious, scannable. Scoped under `.mgmt-ops`.
 */

export function MgmtPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 max-w-3xl space-y-1">
        {eyebrow ? (
          <div className="text-[11px] font-medium text-[var(--mgmt-muted)]">{eyebrow}</div>
        ) : null}
        <h1 className="text-[22px] font-normal tracking-tight text-[var(--mgmt-ink)] sm:text-[28px]">
          {title}
        </h1>
        {description ? (
          <p className="text-[13px] leading-relaxed text-[var(--mgmt-muted)] sm:text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Top-of-page operational issues — visible at first glance. */
export function MgmtAlertStack({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <div className="mb-6 space-y-2 sm:mb-8">{children}</div>;
}

export function MgmtAlert({
  tone,
  title,
  children,
  action,
}: {
  tone: "info" | "warn" | "bad" | "ok";
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const map = {
    info: "border-[var(--mgmt-accent)]/25 bg-[#E8F0FE] text-[var(--mgmt-accent)]",
    warn: "border-[#F9AB00]/40 bg-[#FEF7E0] text-[#B06000]",
    bad: "border-[#F6AEA9] bg-[#FCE8E6] text-[#C5221F]",
    ok: "border-[#A8DAB5] bg-[#E6F4EA] text-[#137333]",
  } as const;
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 ${map[tone]}`}>
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{title}</div>
        {children ? <div className="mt-0.5 text-[12px] opacity-90">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function MgmtKpi({
  label,
  value,
  hint,
  tone = "neutral",
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "ok" | "warn" | "bad";
  delta?: string;
}) {
  const toneClass =
    tone === "ok"
      ? "text-[var(--mgmt-ok)]"
      : tone === "warn"
        ? "text-[var(--mgmt-warn)]"
        : tone === "bad"
          ? "text-[var(--mgmt-danger)]"
          : "text-[var(--mgmt-ink)]";
  return (
    <div className="rounded-xl border border-[var(--mgmt-border)] bg-[var(--mgmt-panel)] p-4 shadow-[var(--mgmt-shadow)]">
      <div className="text-[12px] font-medium text-[var(--mgmt-muted)]">{label}</div>
      <div className={`mt-2 text-[26px] font-normal tabular-nums tracking-tight ${toneClass}`}>{value}</div>
      {(hint || delta) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--mgmt-muted)]">
          {delta ? <span className="font-medium text-[var(--mgmt-ink)]">{delta}</span> : null}
          {hint ? <span>{hint}</span> : null}
        </div>
      )}
    </div>
  );
}

export function MgmtPanel({
  title,
  description,
  actions,
  children,
  className = "",
  flush,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section
      className={`overflow-hidden rounded-xl border border-[var(--mgmt-border)] bg-[var(--mgmt-panel)] shadow-[var(--mgmt-shadow)] ${className}`}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--mgmt-border)] px-5 py-4">
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-medium text-[var(--mgmt-ink)]">{title}</h2> : null}
            {description ? (
              <p className="mt-0.5 text-[12px] text-[var(--mgmt-muted)]">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function MgmtStatus({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "bad" | "idle" | "info";
  children: React.ReactNode;
}) {
  const map = {
    ok: "bg-[#E6F4EA] text-[#137333]",
    warn: "bg-[#FEF7E0] text-[#B06000]",
    bad: "bg-[#FCE8E6] text-[#C5221F]",
    idle: "bg-[#F1F3F4] text-[#5F6368]",
    info: "bg-[#E8F0FE] text-[#174EA6]",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${map[tone]}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          tone === "ok"
            ? "bg-[#137333]"
            : tone === "warn"
              ? "bg-[#F9AB00]"
              : tone === "bad"
                ? "bg-[#C5221F]"
                : tone === "info"
                  ? "bg-[#1A73E8]"
                  : "bg-[#9AA0A6]"
        }`}
      />
      {children}
    </span>
  );
}

export function MgmtTable({ children, minWidth = "640px" }: { children: React.ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function MgmtTh({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`border-b border-[var(--mgmt-border)] bg-[#FAFBFC] px-4 py-3 text-[11px] font-medium text-[var(--mgmt-muted)] ${className}`}
    >
      {children}
    </th>
  );
}

export function MgmtTd({
  children,
  className = "",
  mono,
}: {
  children?: React.ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <td
      className={`border-b border-[var(--mgmt-border)] px-4 py-3 text-[var(--mgmt-ink)] ${
        mono ? "font-mono text-[12px] tabular-nums" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}

export function MgmtTabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string; badge?: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--mgmt-border)]">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`relative -mb-px shrink-0 border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors ${
              active
                ? "border-[var(--mgmt-accent)] text-[var(--mgmt-accent)]"
                : "border-transparent text-[var(--mgmt-muted)] hover:text-[var(--mgmt-ink)]"
            }`}
          >
            {item.label}
            {item.badge ? (
              <span className="ml-1.5 rounded-full bg-[#F1F3F4] px-1.5 py-0.5 text-[10px] text-[var(--mgmt-muted)]">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function MgmtBtn({
  children,
  onClick,
  disabled,
  variant = "secondary",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  type?: "button" | "submit";
}) {
  const styles = {
    primary:
      "bg-[var(--mgmt-accent)] text-white hover:bg-[#1557B0] disabled:opacity-50",
    secondary:
      "border border-[var(--mgmt-border)] bg-white text-[var(--mgmt-ink)] hover:bg-[#F8F9FA] disabled:opacity-50",
    danger:
      "border border-[#F6AEA9] bg-[#FCE8E6] text-[#C5221F] hover:bg-[#FAD2CF] disabled:opacity-50",
    ghost: "text-[var(--mgmt-muted)] hover:bg-[#F1F3F4] hover:text-[var(--mgmt-ink)] disabled:opacity-50",
  } as const;
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-[13px] font-medium transition ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function MgmtField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-medium text-[var(--mgmt-muted)]">{label}</span>
      {children}
    </label>
  );
}

export const mgmtInputClass =
  "h-9 w-full rounded-lg border border-[var(--mgmt-border)] bg-white px-3 text-[13px] text-[var(--mgmt-ink)] outline-none placeholder:text-[var(--mgmt-muted)] focus:border-[var(--mgmt-accent)] focus:ring-2 focus:ring-[var(--mgmt-accent)]/15";
