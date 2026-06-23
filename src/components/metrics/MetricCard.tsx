import * as React from "react";
import { IconArrowUpRight, IconArrowDownRight } from "@tabler/icons-react";

export interface MetricCardProps {
  label: string;
  /** Numeric value or pre-formatted string. For trend math, prefer passing `value` as number and `previous` as number. */
  value: number | string;
  sub?: string;
  /** When provided alongside numeric value, renders a trend pill and overrides sub with "from {previous} (prev period)" unless `sub` is set. */
  previous?: number | null;
  /** Format hint for numeric value */
  format?: "number" | "percent" | "duration";
  /** When format is "duration", unit appended (default "sec"). */
  unit?: string;
  /** Optional bottom-right small badge (e.g. denominator). Ignored when trend pill present. */
  trailing?: React.ReactNode;
  className?: string;
}

const fmtNum = (n: number) => Math.round(n).toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

function formatValue(v: number | string, format: MetricCardProps["format"], unit?: string): string {
  if (typeof v === "string") return v;
  if (format === "percent") return fmtPct(v);
  if (format === "duration") return `${v.toFixed(1)} ${unit ?? "sec"}`;
  return fmtNum(v);
}

export function MetricCard({
  label,
  value,
  sub,
  previous,
  format = "number",
  unit,
  trailing,
  className,
}: MetricCardProps) {
  const numericValue = typeof value === "number" ? value : null;
  const hasTrend =
    numericValue !== null &&
    previous !== null &&
    previous !== undefined &&
    Number.isFinite(previous);

  let trendPct: number | null = null;
  if (hasTrend) {
    if (previous === 0) {
      trendPct = numericValue! > 0 ? 100 : 0;
    } else {
      trendPct = ((numericValue! - (previous as number)) / Math.abs(previous as number)) * 100;
    }
  }

  const display = formatValue(value, format, unit);
  const subLine =
    sub ??
    (hasTrend
      ? `from ${formatValue(previous as number, format, unit)} (prev period)`
      : undefined);

  return (
    <div
      className={`rounded-xl border bg-card p-5 ${className ?? ""}`}
    >
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <p className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
          {display}
        </p>
        {hasTrend && trendPct !== null ? <TrendPill pct={trendPct} /> : null}
        {!hasTrend && trailing ? <span className="ml-auto">{trailing}</span> : null}
      </div>
      {subLine ? (
        <p className="mt-2 text-[13px] text-muted-foreground">{subLine}</p>
      ) : null}
    </div>
  );
}

function TrendPill({ pct }: { pct: number }) {
  const positive = pct >= 0;
  const Icon = positive ? IconArrowUpRight : IconArrowDownRight;
  const cls = positive
    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : "bg-rose-500/10 text-rose-700 dark:text-rose-400";
  const display = `${positive ? "↑" : "↓"} ${Math.abs(pct).toFixed(0)}%`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {display}
    </span>
  );
}
