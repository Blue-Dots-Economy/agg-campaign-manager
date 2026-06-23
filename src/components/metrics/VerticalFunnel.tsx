import * as React from "react";
import { IconArrowNarrowDown } from "@tabler/icons-react";
import type { Accent } from "./primitives";

const TINT: Record<Accent | "coral" | "purple", string> = {
  green: "bg-emerald-500/10",
  amber: "bg-amber-500/10",
  red: "bg-rose-500/10",
  blue: "bg-brand-soft",
  coral: "bg-orange-500/10",
  purple: "bg-violet-500/10",
};
const BAR: Record<Accent | "coral" | "purple", string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  blue: "bg-brand",
  coral: "bg-orange-500",
  purple: "bg-violet-500",
};
const TEXT: Record<Accent | "coral" | "purple", string> = {
  green: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-rose-600 dark:text-rose-400",
  blue: "text-brand",
  coral: "text-orange-600 dark:text-orange-400",
  purple: "text-violet-600 dark:text-violet-400",
};

export type FunnelColor = Accent | "coral" | "purple";

export interface VerticalFunnelStage {
  key: string;
  label: string;
  description?: string;
  value: number;
  color: FunnelColor;
  /** Optional override for the right-side sub-line (defaults to "% of first stage") */
  sub?: string;
  /** Annotation shown in the arrow gap below this stage (i.e. on the way to the NEXT one) */
  nextAnnotation?: string;
  /** Optional secondary metric shown inside the bar (e.g. openings under providers) */
  secondaryValue?: number;
  secondaryLabel?: string;
  /** Optional unit label for the primary value (e.g. "providers") */
  unit?: string;
}

const fmtNum = (n: number) => Math.round(n).toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export function VerticalFunnel({
  title,
  stages,
}: {
  title?: string;
  stages: VerticalFunnelStage[];
}) {
  const baseline = stages[0]?.value ?? 0;
  const visualWidth = (value: number) => {
    if (baseline <= 0) return 100;
    const share = Math.min(1, Math.max(0, value / baseline));
    return Math.max(38, Math.sqrt(share) * 100);
  };
  return (
    <div className="rounded-xl border bg-card p-5">
      {title ? <p className="mb-4 text-sm font-medium text-foreground">{title}</p> : null}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {stages.map((s, i) => {
          const pct = baseline > 0 ? Math.min(100, Math.max(0, (s.value / baseline) * 100)) : 0;
          const width = visualWidth(s.value);
          return (
            <React.Fragment key={s.key}>
              <div className="flex justify-center">
                <div
                  className={`relative overflow-hidden rounded-xl ${TINT[s.color]} px-4 py-4 shadow-sm transition-[width] duration-500`}
                  style={{ width: `${width}%` }}
                >
                  <span className={`absolute inset-x-0 top-0 h-1 ${BAR[s.color]}`} aria-hidden />
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{s.label}</p>
                      {s.description ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{s.description}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-2xl font-semibold tabular-nums ${TEXT[s.color]}`}>
                        {fmtNum(s.value)}
                        {s.unit ? (
                          <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                            {s.unit}
                          </span>
                        ) : null}
                      </p>
                      {s.secondaryValue !== undefined ? (
                        <p className="mt-0.5 text-[11px] font-medium text-foreground/80 tabular-nums">
                          {fmtNum(s.secondaryValue)}
                          {s.secondaryLabel ? (
                            <span className="ml-1 font-normal text-muted-foreground">
                              {s.secondaryLabel}
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                        {s.sub ?? `${fmtPct(pct)} of ${stages[0].label.toLowerCase()}`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {i < stages.length - 1 && s.nextAnnotation ? (
                <div className="flex items-center justify-center gap-2 py-1 text-[11px] text-muted-foreground">
                  <IconArrowNarrowDown className="h-3.5 w-3.5" stroke={2} />
                  <span>{s.nextAnnotation}</span>
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
