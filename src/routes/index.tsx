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
import { useMemo, useState } from "react";
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
import { FunnelSankey } from "@/components/metrics/FunnelSankey";
import { DropBreakdownPanel } from "@/components/metrics/DropBreakdownPanel";
import {
  OverviewFilters,
  type OverviewFilterValue,
} from "@/components/metrics/OverviewFilters";

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
  const [filters, setFilters] = useState<OverviewFilterValue>({
    state: "all",
    dateFrom: null,
    dateTo: null,
  });
  const query = useProgramAggregates(config, filters);
  const data = query.data;

  // Previous-period query: only when both dateFrom & dateTo are set.
  const prevFilters = (() => {
    if (!filters.dateFrom || !filters.dateTo) return null;
    const from = new Date(filters.dateFrom);
    const to = new Date(filters.dateTo);
    const dayMs = 24 * 60 * 60 * 1000;
    const len = Math.max(1, Math.round((to.getTime() - from.getTime()) / dayMs) + 1);
    const prevTo = new Date(from.getTime() - dayMs);
    const prevFrom = new Date(prevTo.getTime() - (len - 1) * dayMs);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return { state: filters.state, dateFrom: iso(prevFrom), dateTo: iso(prevTo) };
  })();
  const prevQuery = useProgramAggregates(
    config,
    prevFilters ?? { state: filters.state, dateFrom: null, dateTo: null },
  );
  const prevMetrics = prevFilters ? prevQuery.data?.metrics : undefined;

  if (query.isLoading && !data) return <LoadingState />;

  const filterBar = (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <OverviewFilters value={filters} onChange={setFilters} />
      {query.isFetching && (
        <span className="text-xs text-muted-foreground">Updating…</span>
      )}
    </div>
  );

  if (!data || data.source === "empty" || data.totalRows === 0) {
    return (
      <div className="space-y-6">
        {filterBar}
        <NoDataState />
      </div>
    );
  }

  const { kpis, perDay, intents, regions, phases, jobStatus, outcomes, dkbIntents, dropAnalysis } =
    data.aggregates;
  const perDayRollup = useMemo(() => {
    const m = new Map<string, { day: string; date: string; rows: number; answered: number; engaged: number; converted: number; new_jobs: number; high_intent: number; sort: number }>();
    for (const p of perDay) {
      const cur = m.get(p.day) ?? { day: p.day, date: p.date, rows: 0, answered: 0, engaged: 0, converted: 0, new_jobs: 0, high_intent: 0, sort: parseInt(p.day.replace(/\D/g, ""), 10) || 0 };
      cur.rows += p.rows; cur.answered += p.answered; cur.engaged += p.engaged;
      cur.converted += p.converted; cur.new_jobs += p.new_jobs; cur.high_intent += p.high_intent;
      m.set(p.day, cur);
    }
    return [...m.values()].sort((a, b) => a.sort - b.sort);
  }, [perDay]);
  const metrics = data.metrics ?? {};
  const hasMetrics = Object.keys(metrics).length > 0;
  const hideRegion: "GZB" | "KA" | undefined =
    filters.state === "GZB" ? "KA" : filters.state === "KA" ? "GZB" : undefined;
  const prevKpis = prevFilters ? prevQuery.data?.aggregates?.kpis : undefined;

  return (
    <div className="space-y-6">
      {filterBar}
      {hasMetrics ? (
        isDkb ? (
          <DkbOverviewMetrics
            m={metrics as unknown as DkbMetrics}
            previous={prevMetrics as unknown as DkbMetrics | undefined}
            perDay={perDayRollup}
          />
        ) : (
          <KkbOverviewMetrics
            m={metrics as unknown as KkbMetrics}
            previous={prevMetrics as unknown as KkbMetrics | undefined}
            perDay={perDayRollup}
          />
        )
      ) : (
        <div className={`grid gap-4 grid-cols-2 ${isDkb ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
          {config.kpis.map((def) => (
            <KpiCard
              key={def.key}
              def={def}
              value={kpis[def.key] ?? 0}
              previous={prevKpis ? prevKpis[def.key] ?? null : null}
            />
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
                  <LineChart data={perDayRollup} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
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
          <div className="grid gap-4">
            <Panel
              title="Campaign performance"
              description="Answered, engaged and converted by campaign day (% of total calls)"
            >
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart
                    data={perDayRollup.map((d) => ({
                      day: d.day,
                      answered: d.rows > 0 ? Math.round((d.answered / d.rows) * 1000) / 10 : 0,
                      engaged: d.rows > 0 ? Math.round((d.engaged / d.rows) * 1000) / 10 : 0,
                      converted: d.rows > 0 ? Math.round((d.converted / d.rows) * 1000) / 10 : 0,
                    }))}
                    margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" unit="%" />
                    <Tooltip
                      {...tooltipStyle}
                      formatter={(value: number) => [`${value}%`, ""]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="answered" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="engaged" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="converted" name={config.successMetric} stroke="var(--color-chart-3)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <FunnelDropCard
              metrics={metrics as unknown as KkbMetrics}
              rows={dropAnalysis}
              hideRegion={hideRegion}
            />
          </div>


          <div className="grid gap-4 lg:grid-cols-3">
            <Panel className="lg:col-span-2" title="Intent score distribution" description="Engaged callers only (score 1–10), bucketed">
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart
                    data={(() => {
                      const buckets = [
                        { range: "Low (1–4)", count: 0 },
                        { range: "Medium (5–7)", count: 0 },
                        { range: "High (8–10)", count: 0 },
                      ];
                      for (const r of intents as Array<{ score: number | string; count: number }>) {
                        const s = Number(r.score);
                        if (!Number.isFinite(s) || s <= 0) continue;
                        if (s <= 4) buckets[0].count += r.count;
                        else if (s <= 7) buckets[1].count += r.count;
                        else if (s <= 10) buckets[2].count += r.count;
                      }
                      return buckets;
                    })()}
                    margin={{ top: 10, right: 16, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="range" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
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
