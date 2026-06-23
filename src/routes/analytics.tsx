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
import { useProgramAggregates } from "@/programs/useProgramAggregates";
import { Panel } from "@/components/Panel";
import { NoDataState, LoadingState } from "@/components/EmptyState";

export const Route = createFileRoute("/analytics")({
  component: Analytics,
});

function Analytics() {
  const { config } = useProgram();
  const isDkb = config.id === "dkb";
  const query = useProgramAggregates(config);
  const data = query.data;

  const tooltip = {
    contentStyle: {
      background: "var(--color-card)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      fontSize: 12,
    },
  };

  if (query.isLoading && !data) return <LoadingState />;
  if (!data || data.source === "empty" || data.totalRows === 0) return <NoDataState />;

  const { perDay, drops, intents, phases, jobStatus, outcomes, dkbIntents } = data.aggregates;

  const dayRollup = useMemo(() => {
    // Group by the actual parsed campaign_date so the trend chart is in true
    // chronological order with real calendar gaps preserved.
    const m = new Map<string, { day: string; date: string; label: string; rows: number; answered: number; engaged: number; converted: number; new_jobs: number; high_intent: number }>();
    for (const p of perDay) {
      const key = p.date || p.day;
      const cur = m.get(key) ?? { day: p.day, date: p.date, label: p.date || p.day, rows: 0, answered: 0, engaged: 0, converted: 0, new_jobs: 0, high_intent: 0 };
      cur.rows += p.rows; cur.answered += p.answered; cur.engaged += p.engaged;
      cur.converted += p.converted; cur.new_jobs += p.new_jobs; cur.high_intent += p.high_intent;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  }, [perDay]);

  return (
    <div className="space-y-6">
      <Panel
        title="Trend over time"
        description={isDkb ? "Calls vs answered vs new jobs posted per day" : "Calls answered vs engaged by campaign day"}
      >
        <div className="h-72">
          <ResponsiveContainer>
            <AreaChart data={dayRollup} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="a1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="a2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-2)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="a3" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-3)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-chart-3)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />

              <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
              <Tooltip {...tooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {isDkb ? (
                <>
                  <Area type="monotone" dataKey="rows" name="calls" stroke="var(--color-chart-1)" fill="url(#a1)" strokeWidth={2} />
                  <Area type="monotone" dataKey="answered" stroke="var(--color-chart-2)" fill="url(#a2)" strokeWidth={2} />
                  <Area type="monotone" dataKey="new_jobs" name="new jobs" stroke="var(--color-chart-3)" fill="url(#a3)" strokeWidth={2} />
                </>
              ) : (
                <>
                  <Area type="monotone" dataKey="answered" stroke="var(--color-chart-1)" fill="url(#a1)" strokeWidth={2} />
                  <Area type="monotone" dataKey="engaged" stroke="var(--color-chart-2)" fill="url(#a2)" strokeWidth={2} />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {isDkb ? (
          <>
            <Panel title="Phases reached" description="Funnel of conversation depth">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={phases} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="phase" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...tooltip} />
                    <Bar dataKey="count" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Call outcome breakdown" description="How DKB calls ended">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={outcomes} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="outcome" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...tooltip} />
                    <Bar dataKey="count" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Job status breakdown" description="Verification outcome per posting">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={jobStatus} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="status" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...tooltip} />
                    <Bar dataKey="count" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Intent distribution" description="Score 0–10">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={dkbIntents} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="score" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...tooltip} />
                    <Bar dataKey="count" fill="var(--color-chart-4)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      <Panel
        title="Compare campaign days"
        description={isDkb ? "New jobs posted and high-intent by day" : `Conversion (${config.successMetric}) and high-intent by day`}
      >
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={dayRollup} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
              <Tooltip {...tooltip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey={isDkb ? "new_jobs" : "converted"}
                name={isDkb ? "new jobs" : config.successMetric}
                fill="var(--color-chart-1)"
                radius={[4, 4, 0, 0]}
              />
              <Bar dataKey="high_intent" name="high-intent" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
