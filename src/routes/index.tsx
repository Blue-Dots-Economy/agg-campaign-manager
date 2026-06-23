import { createFileRoute } from "@tanstack/react-router";
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
import { useProgramAggregates } from "@/programs/useProgramAggregates";
import { KpiCard } from "@/components/KpiCard";
import {
  KkbOverviewMetrics,
  DkbOverviewMetrics,
  type KkbMetrics,
  type DkbMetrics,
} from "@/components/metrics/program-overviews";
import { Panel } from "@/components/Panel";
import { NoDataState, LoadingState } from "@/components/EmptyState";

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

const tooltipStyle = {
  contentStyle: {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 12,
  },
} as const;

function Overview() {
  const { config } = useProgram();
  const isDkb = config.id === "dkb";
  const query = useProgramAggregates(config);
  const data = query.data;

  if (query.isLoading && !data) return <LoadingState />;
  if (!data || data.source === "empty" || data.totalRows === 0) return <NoDataState />;

  const { kpis, perDay, drops, intents, regions, phases, jobStatus, outcomes, dkbIntents } =
    data.aggregates;
  const metricGroups = data.metricGroups ?? [];

  return (
    <div className="space-y-6">
      {metricGroups.length > 0 ? (
        <div className="space-y-6">
          {metricGroups.map((g) => (
            <MetricGroupSection key={g.key} group={g} />
          ))}
        </div>
      ) : (
        <div className={`grid gap-4 grid-cols-2 ${isDkb ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
          {config.kpis.map((def) => (
            <KpiCard key={def.key} def={def} value={kpis[def.key] ?? 0} />
          ))}
        </div>
      )}


      {isDkb ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel
              className="lg:col-span-2"
              title="Performance by day"
              description="Calls, answered and new jobs posted per campaign day"
            >
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={perDay} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="rows" name="calls" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="answered" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="new_jobs" name="new jobs" stroke="var(--color-chart-3)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Phases reached" description="How deep the conversation got">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={phases} layout="vertical" margin={{ top: 10, right: 16, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis dataKey="phase" type="category" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" width={90} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill="var(--color-chart-2)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Job status" description="Verification outcome per posting">
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={jobStatus} dataKey="count" nameKey="status" innerRadius={45} outerRadius={80} paddingAngle={2}>
                      {jobStatus.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Call outcome" description="How calls ended">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={outcomes} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="outcome" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Intent distribution" description="0–10 score from voice agent">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={dkbIntents} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="score" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <>
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
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="answered" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="engaged" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="converted" name={config.successMetric} stroke="var(--color-chart-3)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Drop reasons" description="Where conversations ended">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={drops} layout="vertical" margin={{ top: 10, right: 16, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis dataKey="reason" type="category" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" width={150} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
                  </BarChart>
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
                    <Tooltip {...tooltipStyle} />
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
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" fill="var(--color-chart-2)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
