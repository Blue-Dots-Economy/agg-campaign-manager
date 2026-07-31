import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { Panel } from "@/components/Panel";
import { fetchNorthStar } from "@/lib/north-star.functions";

const tooltipStyle = {
  contentStyle: {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 12,
  },
} as const;

export interface NorthStarTrendPoint {
  label: string;
  answered: number;
  high_intent: number;
  converted: number;
}

const SERIES = [
  { key: "pickup_to_app", name: "Pickup → Application", color: "var(--color-chart-1)" },
  { key: "highintent_to_app", name: "High-Intent → Application", color: "var(--color-chart-2)" },
  { key: "pickup_to_highintent", name: "Pickup → High-Intent", color: "var(--color-chart-3)" },
] as const;

const pct = (n: number, d: number) => (d > 0 ? Number(((n / d) * 100).toFixed(1)) : 0);

export function NorthStarTrend({
  program,
  perDay,
}: {
  program: string;
  perDay: NorthStarTrendPoint[];
}) {
  const fetchFn = useServerFn(fetchNorthStar);
  const { data: config } = useQuery({
    queryKey: ["north-star", program],
    queryFn: () => fetchFn({ data: { program } }),
    staleTime: 5 * 60_000,
  });

  const data = useMemo(
    () =>
      (perDay ?? []).map((p) => ({
        label: p.label,
        pickup_to_app: pct(p.converted, p.answered),
        highintent_to_app: pct(p.converted, p.high_intent),
        pickup_to_highintent: pct(p.high_intent, p.answered),
      })),
    [perDay],
  );

  const targets = new Map((config ?? []).map((r) => [r.key, r.threshold]));

  const averages = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of SERIES) {
      if (data.length === 0) {
        out[s.key] = 0;
        continue;
      }
      const sum = data.reduce((acc, d) => acc + (Number(d[s.key as keyof typeof d]) || 0), 0);
      out[s.key] = Number((sum / data.length).toFixed(1));
    }
    return out;
  }, [data]);

  if (data.length === 0) return null;

  return (
    <Panel
      title="North Star performance over time"
      description="Daily conversion rates against shared targets"
    >
      <div className="h-72">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="var(--color-muted-foreground)"
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip {...tooltipStyle} formatter={(v: number) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {SERIES.map((s) => {
              const t = targets.get(s.key);
              return t == null ? null : (
                <ReferenceLine
                  key={`t-${s.key}`}
                  y={t}
                  stroke={s.color}
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />
              );
            })}
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {SERIES.map((s) => {
          const t = targets.get(s.key);
          return (
            <div key={`avg-${s.key}`} className="rounded-md border border-border px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                <span className="truncate">{s.name}</span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-lg font-semibold tabular-nums">{averages[s.key].toFixed(1)}%</span>
                <span className="text-[11px] text-muted-foreground">
                  avg · {data.length} {data.length === 1 ? "day" : "days"}
                  {t == null ? "" : ` · target ${t}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Averages cover the {data.length} campaign {data.length === 1 ? "day" : "days"} in range; days
        without data count as 0%. Dashed lines show the shared target for each metric (set them in
        North Star Metrics).
      </p>
    </Panel>
  );
}
