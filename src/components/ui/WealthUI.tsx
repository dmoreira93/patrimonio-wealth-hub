import React from "react";
import { X } from "lucide-react";

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {eyebrow}
          </p>
        )}
        <h1 className="font-serif text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export type StatTone = "default" | "gold" | "positive" | "negative" | "sky";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
  badge,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const toneClasses: Record<StatTone, string> = {
    default: "text-slate-900",
    gold: "text-slate-900",
    positive: "text-emerald-700",
    negative: "text-rose-700",
    sky: "text-sky-700",
  };

  const borderClasses: Record<StatTone, string> = {
    default: "border-slate-200 bg-white",
    gold: "border-slate-300 bg-slate-50/90",
    positive: "border-emerald-200/80 bg-white",
    negative: "border-rose-200/80 bg-white",
    sky: "border-sky-200/80 bg-white",
  };

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm transition-colors ${borderClasses[tone]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <p
          className={`font-mono text-xl font-bold tracking-tight tabular-nums sm:text-2xl ${toneClasses[tone]}`}
        >
          {value}
        </p>
        {badge}
      </div>
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
  noPadding = false,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={noPadding ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "gold" | "positive" | "negative" | "sky" | "purple";
}) {
  const styles = {
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    gold: "bg-slate-200/80 text-slate-800 border-slate-300",
    positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
    negative: "bg-rose-50 text-rose-700 border-rose-200",
    sky: "bg-sky-50 text-sky-700 border-sky-200",
    purple: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  pct,
  tone = "gold",
  height = "h-2",
}: {
  pct: number;
  tone?: "gold" | "positive" | "negative" | "sky" | "purple";
  height?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  const colors = {
    gold: "bg-slate-800",
    positive: "bg-emerald-600",
    negative: "bg-rose-600",
    sky: "bg-sky-600",
    purple: "bg-indigo-600",
  };
  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-100 ${height}`}>
      <div
        className={`${height} rounded-full transition-all duration-300 ${colors[tone]}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
      <div
        className={`relative max-h-[90vh] w-full ${maxWidth} overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl`}
      >
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-serif text-lg font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
