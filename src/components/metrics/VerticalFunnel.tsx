import * as React from "react";
import { IconArrowNarrowDown } from "@tabler/icons-react";
import { Copy } from "lucide-react";
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
  fill = false,
  pickedUpKey,
  onStageClick,
}: {
  title?: string;
  stages: VerticalFunnelStage[];
  fill?: boolean;
  /** Key of the stage to use as a secondary "% of picked up" baseline. Shown in blue on later stages. */
  pickedUpKey?: string;
  onStageClick?: (key: string) => void;
}) {
  const baseline = stages[0]?.value ?? 0;
  const pickedUpIdx = pickedUpKey ? stages.findIndex((s) => s.key === pickedUpKey) : -1;
  const pickedUpValue = pickedUpIdx >= 0 ? stages[pickedUpIdx].value : 0;
  const pickedUpLabel = pickedUpIdx >= 0 ? stages[pickedUpIdx].label.toLowerCase() : "picked up";
  const visualWidth = (value: number) => {
    if (baseline <= 0) return 100;
    const share = Math.min(1, Math.max(0, value / baseline));
    return Math.max(38, Math.sqrt(share) * 100);
  };
  return (
    <div className={`rounded-xl border bg-card p-5 ${fill ? "flex h-full flex-col" : ""}`}>
      {title ? <p className="mb-4 text-sm font-medium text-foreground">{title}</p> : null}
      <div className={fill ? "flex flex-1 flex-col justify-between gap-2" : "space-y-2"}>

        {stages.map((s, i) => {
          const pct = baseline > 0 ? Math.min(100, Math.max(0, (s.value / baseline) * 100)) : 0;
          const width = visualWidth(s.value);
          const interactive = !!onStageClick;
          return (
            <React.Fragment key={s.key}>
              <div className="flex justify-center">
                <div
                  className={`group relative overflow-hidden rounded-xl ${TINT[s.color]} px-4 py-4 shadow-sm transition-[width,box-shadow] duration-500 ${
                    interactive
                      ? "cursor-pointer hover:ring-2 hover:ring-primary/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      : ""
                  }`}
                  style={{ width: `${width}%` }}
                  {...(interactive
                    ? {
                        role: "button",
                        tabIndex: 0,
                        title: `Copy call IDs that reached ${s.label}`,
                        onClick: () => onStageClick!(s.key),
                        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onStageClick!(s.key);
                          }
                        },
                      }
                    : {})}
                >
                  <span className={`absolute inset-x-0 top-0 h-1 ${BAR[s.color]}`} aria-hidden />
                  {interactive ? (
                    <Copy
                      className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  ) : null}
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
                      {pickedUpIdx >= 0 && i > pickedUpIdx && pickedUpValue > 0 ? (
                        <p className="mt-0.5 text-[11px] font-medium tabular-nums text-sky-600 dark:text-sky-400">
                          {fmtPct((s.value / pickedUpValue) * 100)} of {pickedUpLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {i < stages.length - 1 ? (() => {
                const next = stages[i + 1];
                const dropPct = s.value > 0 ? ((s.value - next.value) / s.value) * 100 : 0;
                const dropAbs = Math.max(0, s.value - next.value);
                const annotation = s.nextAnnotation ?? `−${fmtPct(dropPct)} drop · ${fmtNum(dropAbs)} ${s.unit ?? ""} lost`.trim();
                return (
                  <div className="flex items-center justify-center gap-2 py-2 text-[11px] font-medium text-muted-foreground">
                    <IconArrowNarrowDown className="h-3.5 w-3.5" stroke={2} />
                    <span>{annotation}</span>
                  </div>
                );
              })() : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
