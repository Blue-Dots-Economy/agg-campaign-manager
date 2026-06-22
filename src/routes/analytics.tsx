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
import {
  byCampaignDay,
  dropReasonBreakdown,
  intentDistribution,
  phasesReachedBreakdown,
  jobStatusBreakdown,
  callOutcomeBreakdown,
  intentDistributionDkb,
} from "@/programs/metrics";
import { Panel } from "@/components/Panel";
import { NoDataState, LoadingState } from "@/components/EmptyState";

export const Route = createFileRoute("/analytics")({
  component: Analytics,
});

function Analytics() {
  const { config } = useProgram();
  const { rows, isLoading, source } = useCampaignData(config);
  const isDkb = config.id === "dkb";
  const perDay = useMemo(() => byCampaignDay(config, rows), [config, rows]);

  const tooltip = {
    contentStyle: {
      background: "var(--color-card)",
      border: "1px solid var(--color-border)",
      borderRadius: 8,
      fontSize: 12,
    },
  };

  // KKB
  const drops = useMemo(() => (isDkb ? [] : dropReasonBreakdown(config, rows)), [config, rows, isDkb]);
  const intents = useMemo(() => (isDkb ? [] : intentDistribution(rows)), [rows, isDkb]);
  // DKB
  const phases = useMemo(() => (isDkb ? phasesReachedBreakdown(rows) : []), [rows, isDkb]);
  const jobStatus = useMemo(() => (isDkb ? jobStatusBreakdown(rows) : []), [rows, isDkb]);
  const outcomes = useMemo(() => (isDkb ? callOutcomeBreakdown(rows) : []), [rows, isDkb]);
  const dkbIntents = useMemo(() => (isDkb ? intentDistributionDkb(rows) : []), [rows, isDkb]);

  if (isLoading) return <LoadingState />;
  if (source === "empty" || rows.length === 0) return <NoDataState />;

  return (
    <div className="space-y-6">
      <Panel
        title="Trend over time"
        description={isDkb ? "Calls vs answered vs new jobs posted per day" : "Calls answered vs engaged by campaign day"}
      >
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
                <linearGradient id="a3" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-chart-3)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-chart-3)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
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
            <BarChart data={perDay} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
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
