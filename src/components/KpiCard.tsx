import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { KpiDef } from "@/programs/registry";

interface Props {
  def: KpiDef;
  value: number;
}

export function KpiCard({ def, value }: Props) {
  const Icon = (Icons[def.icon as keyof typeof Icons] as LucideIcon) ?? Icons.Activity;
  const displayValue =
    def.format === "percent" ? `${Math.round(value)}%` : Math.round(value).toLocaleString();

  // Progress 0..1
  const target = def.target ?? (def.format === "percent" ? 100 : Math.max(value, 1));
  const pct = Math.min(1, value / target);
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{def.label}</p>
          <p className="text-2xl font-semibold mt-2 tracking-tight">{displayValue}</p>
        </div>
        <div className="relative h-14 w-14">
          <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
            <circle cx="28" cy="28" r={radius} className="fill-none stroke-muted" strokeWidth="5" />
            <circle
              cx="28"
              cy="28"
              r={radius}
              className="fill-none stroke-brand"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 600ms ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className="h-4 w-4 text-brand" />
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Target {def.format === "percent" ? `${target}%` : target.toLocaleString()}
      </p>
    </div>
  );
}
