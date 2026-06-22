import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { useProgram } from "@/programs/context";
import { getCampaignData } from "@/programs/data";
import {
  computeKpis,
  byCampaignDay,
  dropReasonBreakdown,
  intentDistribution,
  regionSplit,
} from "@/programs/metrics";
import { KpiCard } from "@/components/KpiCard";
import { Panel } from "@/components/Panel";

export const Route = createFileRoute("/")({
  component: Overview,
});

const PIE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-muted-foreground)",
];

function Overview() {
  const { config } = useProgram();

  const { rows, kpis, perDay, drops, intents, regions } = useMemo(() => {
    const rows = getCampaignData(config);
    return {
      rows,
      kpis: computeKpis(config, rows),
      perDay: byCampaignDay(config, rows),
      drops: dropReasonBreakdown(config, rows),
      intents: intentDistribution(rows),
      regions: regionSplit(rows),
    };
  }, [config]);

  void rows;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {config.kpis.map((def) => (
          <KpiCard key={def.key} def={def} value={kpis[def.key] ?? 0} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Campaign performance"
          description="Answered, engaged and converted by campaign day"
        >
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={perDay} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="answered" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="engaged" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="converted"
                  name={config.successMetric}
                  stroke="var(--color-chart-3)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Drop reasons" description="Where conversations ended">
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={drops}
                  dataKey="count"
                  nameKey="reason"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {drops.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Intent score distribution" description="0–10 score from voice agent">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={intents} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="score" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Region split" description="KA vs GZB">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={regions} layout="vertical" margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis dataKey="region" type="category" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="var(--color-chart-2)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}
