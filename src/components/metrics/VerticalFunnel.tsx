import * as React from "react";
import { IconArrowNarrowDown } from "@tabler/icons-react";
import { Copy, Phone } from "lucide-react";
import type { Accent } from "./primitives";

const TINT: Record<Accent | "coral" | "purple", string> = {
  green: "bg-emerald-500/10", amber: "bg-amber-500/10", red: "bg-rose-500/10",
  blue: "bg-brand-soft", coral: "bg-orange-500/10", purple: "bg-violet-500/10",
};
const BAR: Record<Accent | "coral" | "purple", string> = {
  green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-rose-500",
  blue: "bg-brand", coral: "bg-orange-500", purple: "bg-violet-500",
};
const TEXT: Record<Accent | "coral" | "purple", string> = {
  green: "text-emerald-600 dark:text-emerald-400", amber: "text-amber-600 dark:text-amber-400",
  red: "text-rose-600 dark:text-rose-400", blue: "text-brand",
  coral: "text-orange-600 dark:text-orange-400", purple: "text-violet-600 dark:text-violet-400",
};

export type FunnelColor = Accent | "coral" | "purple";

export interface VerticalFunnelStage {
  key: string;
  label: string;
  description?: string;
  value: number;
  color: FunnelColor;
  sub?: string;
  nextAnnotation?: string;
  secondaryValue?: number;
  secondaryLabel?: string;
  unit?: string;
  avgDurationSec?: number;
}

const fmtNum = (n: number) => Math.round(n).toLocaleString();
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
function fmtDur(sec?: number): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

export function VerticalFunnel({
  title, stages, fill = false, pickedUpKey, onStageClick,
}: {
  title?: string;
  stages: VerticalFunnelStage[];
  fill?: boolean;
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
    return Math.max(42, Math.sqrt(share) * 100);
  };
  const interactive = !!onStageClick;
  return (
    <div className={`rounded-xl border bg-card p-5 ${fill ? "flex h-full flex-col" : ""}`}>
      {title ? <p className="mb-4 text-sm font-medium text-foreground">{title}</p> : null}
      <div className={fill ? "flex flex-1 flex-col justify-between gap-2" : "space-y-2"}>
        {stages.map((s, i) => {
          const pct = baseline > 0 ? Math.min(100, Math.max(0, (s.value / baseline) * 100)) : 0;
          const width = visualWidth(s.value);
          const dur = fmtDur(s.avgDurationSec);
          return (
            <React.Fragment key={s.key}>
              <div className="flex justify-center">
                <div
                  className={`group relative overflow-hidden rounded-xl ${TINT[s.color]} px-4 pt-4 pb-3.5 shadow-sm transition-[width,box-shadow] duration-500 ${
                    interactive ? "cursor-pointer hover:ring-2 hover:ring-primary/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60" : ""
                  }`}
                  style={{ width: `${width}%` }}
                  {...(interactive ? {
                    role: "button", tabIndex: 0,
                    title: `Copy call IDs that reached ${s.label}`,
                    onClick: () => onStageClick!(s.key),
                    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onStageClick!(s.key); }
                    },
                  } : {})}
                >
                  <span className={`absolute inset-x-0 top-0 h-1 ${BAR[s.color]}`} aria-hidden />
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex flex-col gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-foreground leading-tight">{s.label}</p>
                          {interactive ? (
                            <Copy className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                          ) : null}
                        </div>
                        {s.description ? (
                          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{s.description}</p>
                        ) : null}
                      </div>
                      {dur ? (
                        <span className="inline-flex items-center gap-1 self-start rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                          <Phone className="h-3 w-3" aria-hidden />
                          {dur}
                        </span>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-2xl font-semibold leading-none tabular-nums ${TEXT[s.color]}`}>
                        {fmtNum(s.value)}
                        {s.unit ? <span className="ml-1 text-[11px] font-normal text-muted-foreground">{s.unit}</span> : null}
                      </p>
                      {s.secondaryValue !== undefined ? (
                        <p className="mt-1 text-[11px] font-medium tabular-nums text-foreground/80">
                          {fmtNum(s.secondaryValue)}
                          {s.secondaryLabel ? <span className="ml-1 font-normal text-muted-foreground">{s.secondaryLabel}</span> : null}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
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
