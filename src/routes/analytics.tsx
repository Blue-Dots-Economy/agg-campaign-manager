import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useProgram } from "@/programs/context";
import { useCampaignData } from "@/programs/useCampaignData";
import { byCampaignDay, dropReasonBreakdown, intentDistribution } from "@/programs/metrics";
import { Panel } from "@/components/Panel";

export const Route = createFileRoute("/analytics")({
  component: Analytics,
});

function Analytics() {
  const { config } = useProgram();
  const { rows } = useCampaignData(config);
  const perDay = useMemo(() => byCampaignDay(config, rows), [config, rows]);
  const drops = useMemo(() => dropReasonBreakdown(config, rows), [config, rows]);
  const intents = useMemo(() => intentDistribution(rows), [rows]);

  const tooltip = {
    contentStyle: {
      background: "var(--color-card)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      fontSize: 12,
    },
  };

  return (
    <div className="space-y-6">
      <Panel title="Trend over time" description="Calls answered vs engaged by campaign day">
        <div className="h-72">
          <ResponsiveContainer>
            <AreaChart data={perDay} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="a1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="a2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-2)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
              <Tooltip {...tooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="answered" stroke="var(--color-chart-1)" fill="url(#a1)" strokeWidth={2} />
              <Area type="monotone" dataKey="engaged" stroke="var(--color-chart-2)" fill="url(#a2)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Drop-reason breakdown" description="Volume per bucket">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={drops} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="reason" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <Tooltip {...tooltip} />
                <Bar dataKey="count" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Intent distribution" description="Score 0–10">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={intents} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="score" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <Tooltip {...tooltip} />
                <Bar dataKey="count" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Compare campaign days" description={`Conversion (${config.successMetric}) and high-intent by day`}>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={perDay} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
              <Tooltip {...tooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="converted" name={config.successMetric} fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="high_intent" name="high-intent" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
