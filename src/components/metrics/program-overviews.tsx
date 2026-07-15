import { useState } from "react";
import { cn } from "@/lib/utils";
import { MetricSection, SplitBar } from "@/components/metrics/primitives";
import { MetricCard } from "@/components/metrics/MetricCard";
import { VerticalFunnel, type VerticalFunnelStage, type FunnelColor } from "@/components/metrics/VerticalFunnel";

export interface DailyPoint {
  day: string;
  rows: number;
  answered: number;
  engaged: number;
  converted: number;
  new_jobs: number;
  high_intent: number;
}

const safeDiv = (n: number, d: number) => (d > 0 ? n / d : 0);
const series = <T,>(arr: T[] | undefined, fn: (p: T) => number): number[] =>
  (arr ?? []).map(fn).filter((v) => Number.isFinite(v));

export interface KkbMetrics {
  totalCalls: number;
  answeredCalls: number;
  unansweredCalls: number;
  productiveCalls: number;
  avgDuration: number;
  engagedCalls: number;
  jobsShownCalls: number;
  highIntentCalls: number;
  applicationsSubmitted: number;
  applicationsBlocked: number;
  applicationsTotal: number;
  hasInterviewData: boolean;
  interviewCount: number;
  seekers: number;
  answeredSeekers: number;
  triedSeekers: number;
  appliedSeekers: number;
  failedSeekers: number;
  didNotApply: number;
  totalApplications: number;
  engagedSeekers: number;
  jobsShownSeekers: number;
  highIntentSeekers: number;
  applicationsSeekers: number;
}

export interface DkbProviderFunnelStage {
  key: string;
  label: string;
  providers: number;
  openings: number;
  calls: number;
}

export interface DkbMetrics {
  totalCalls: number;
  answeredCalls: number;
  unansweredCalls: number;
  productiveCalls: number;
  avgDuration: number;
  totalOpenings: number;
  activeOpenings: number;
  closedOpenings: number;
  unresolvedOpenings: number;
  newOpenings: number;
  companiesCalled: number;
  jobsActive: number;
  jobsClosed: number;
  companiesUnresolved: number;
  newJobsDiscussed: number;
  newJobsPosted: number;
  providerFunnel?: DkbProviderFunnelStage[];
}

// Helper: pull a numeric metric from a previous-period metrics object (may be undefined).
function prev<T extends object>(prev: T | undefined, key: keyof T): number | null {
  if (!prev) return null;
  const v = prev[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function KkbOverviewMetrics({
  m,
  previous,
  perDay,
  comparisonLabel,
  onFunnelStageClick,
  stageDurations,
}: {
  m: KkbMetrics;
  previous?: KkbMetrics;
  perDay?: DailyPoint[];
  comparisonLabel?: string;
  onFunnelStageClick?: (key: string, action: "copy" | "review") => void;
  stageDurations?: Record<string, number>;
}) {
  const appRate = m.answeredSeekers > 0 ? (m.appliedSeekers / m.answeredSeekers) * 100 : 0;
  const productivePct = m.totalCalls > 0 ? (m.productiveCalls / m.totalCalls) * 100 : 0;
  const prevAppRate =
    previous && previous.answeredSeekers > 0
      ? (previous.appliedSeekers / previous.answeredSeekers) * 100
      : null;
  const prevProductivePct =
    previous && previous.totalCalls > 0
      ? (previous.productiveCalls / previous.totalCalls) * 100
      : null;

  const [view, setView] = useState<"hybrid" | "calls" | "seekers">("hybrid");
  const callsByStage: Record<string, number> = {
    calls: m.totalCalls, picked: m.answeredCalls, engaged: m.engagedCalls,
    jobs: m.jobsShownCalls, intent: m.highIntentCalls, apps: m.applicationsTotal,
  };
  const seekersByStage: Record<string, number> = {
    calls: m.seekers, picked: m.answeredSeekers, engaged: m.engagedSeekers,
    jobs: m.jobsShownSeekers, intent: m.highIntentSeekers, apps: m.applicationsSeekers,
  };
  const seekerStageKeys = new Set(["engaged", "jobs", "intent", "apps"]);
  const dimOf = (key: string): "calls" | "seekers" =>
    view === "calls" ? "calls" : view === "seekers" ? "seekers" : seekerStageKeys.has(key) ? "seekers" : "calls";
  const valOf = (key: string): number =>
    (dimOf(key) === "seekers" ? seekersByStage[key] : callsByStage[key]) ?? 0;
  const dropLabels: Record<string, string> = {
    calls: "no pickup", picked: "drop after pickup", engaged: "don't reach jobs",
    jobs: "reach high-intent", intent: "never apply",
  };
  const stageDefs: Array<{ key: string; label: string; description: string; color: FunnelColor }> = [
    { key: "calls", label: "Calls made", description: "All dialled attempts", color: "blue" },
    { key: "picked", label: "Picked up", description: "Seeker answered", color: "green" },
    { key: "engaged", label: "Engaged", description: "3+ real conversation turns", color: "green" },
    { key: "jobs", label: "Jobs shown", description: "Bot presented openings", color: "amber" },
    { key: "intent", label: "High-Intent (≥5)", description: "Intent score ≥ 5", color: "coral" },
    { key: "apps", label: "Applications", description: `${m.applicationsSubmitted.toLocaleString()} submitted + ${m.applicationsBlocked.toLocaleString()} blocked`, color: "coral" },
  ];
  const stages: VerticalFunnelStage[] = stageDefs.map((s, i) => {
    const value = valOf(s.key);
    const next = stageDefs[i + 1];
    const nextVal = next ? valOf(next.key) : null;
    const dropAnn =
      next && value > 0 && nextVal != null
        ? `-${Math.max(0, (1 - nextVal / value) * 100).toFixed(1)}% ${dropLabels[s.key] ?? "drop"}`
        : undefined;
    return {
      key: s.key, label: s.label, description: s.description, value, color: s.color,
      unit: dimOf(s.key) === "seekers" ? "seekers" : undefined,
      nextAnnotation: dropAnn,
      avgDurationSec: stageDurations?.[s.key],
    };
  });

  return (
    <div className="space-y-8">
      <MetricSection title="Outcome metrics" subtitle="Funnel from calls made to applications">
        <div className="grid items-stretch gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <VerticalFunnel stages={stages} fill pickedUpKey="picked" onStageClick={onFunnelStageClick} />
          </div>

          <div className="grid gap-3 lg:col-span-2 lg:grid-cols-1">
            <SplitBar answered={m.answeredCalls} unanswered={m.unansweredCalls} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <MetricCard
                label="Productive conversations"
                value={productivePct}
                format="percent"
                sub={previous ? undefined : `${m.productiveCalls.toLocaleString()} calls — answered + > 30s`}
                previous={prevProductivePct}
                comparisonLabel={comparisonLabel}
                trend={series(perDay, (p) => safeDiv(p.engaged, p.rows) * 100)}
              />
              <MetricCard
                label="High Intent Seekers"
                value={m.highIntentCalls}
                sub={previous ? undefined : "Intent score ≥ 5"}
                previous={prev(previous, "highIntentCalls")}
                comparisonLabel={comparisonLabel}
                trend={series(perDay, (p) => p.high_intent)}
              />
              <MetricCard
                label="Application rate"
                value={appRate}
                format="percent"
                sub={previous ? undefined : "Applied / answered seekers"}
                previous={prevAppRate}
                comparisonLabel={comparisonLabel}
                trend={series(perDay, (p) => safeDiv(p.converted, p.answered) * 100)}
              />

            </div>
          </div>
        </div>
      </MetricSection>
    </div>
  );
}

export function DkbOverviewMetrics({
  m,
  previous,
  perDay,
  comparisonLabel,
  onFunnelStageClick,
  stageDurations,
}: {
  m: DkbMetrics;
  previous?: DkbMetrics;
  perDay?: DailyPoint[];
  comparisonLabel?: string;
  onFunnelStageClick?: (key: string, action: "copy" | "review") => void;
  stageDurations?: Record<string, number>;
}) {
  const pickupPct = m.totalCalls > 0 ? (m.answeredCalls / m.totalCalls) * 100 : 0;
  const productiveDenom = m.totalCalls;
  const productivePct = productiveDenom > 0 ? (m.productiveCalls / productiveDenom) * 100 : 0;
  const prevProductivePct =
    previous && previous.totalCalls > 0
      ? (previous.productiveCalls / previous.totalCalls) * 100
      : null;
  const highIntentTotal = (perDay ?? []).reduce((sum, p) => sum + (p.high_intent ?? 0), 0);
  const prevHighIntent: number | null = null;

  const funnelData = m.providerFunnel ?? [];
  const calledProviders = funnelData[0]?.providers ?? 0;
  const colors: FunnelColor[] = ["blue", "green", "green", "coral", "purple"];
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  const drop = (n: number, d: number) => (d > 0 ? Math.max(0, (1 - n / d) * 100) : 0);

  const funnelStages: VerticalFunnelStage[] = funnelData.map((s, i) => {
    const prevStage = i > 0 ? funnelData[i - 1] : undefined;
    const ofCalled = pct(s.providers, calledProviders);
    const step = i === 0 ? 0 : drop(s.providers, prevStage?.providers ?? 0);
    return {
      key: s.key,
      label: s.label,
      value: s.providers,
      unit: "providers",
      secondaryValue: s.openings,
      secondaryLabel: "openings",
      color: colors[i] ?? "blue",
      sub:
        i === 0
          ? "100% of called"
          : `${ofCalled.toFixed(1)}% of called  ·  −${step.toFixed(1)}% step`,
      nextAnnotation: i < funnelData.length - 1 ? undefined : undefined,
      avgDurationSec: stageDurations?.[s.key],
    };
  });

  return (
    <div className="space-y-8">
      <MetricSection
        title="Outcome metrics"
        subtitle="Provider funnel — Called → Picked up → Engaged → Actively hiring"
      >
        <div className="grid items-stretch gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            {funnelStages.length > 0 ? (
              <VerticalFunnel stages={funnelStages} fill pickedUpKey="picked" onStageClick={onFunnelStageClick} />
            ) : (
              <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                No provider data available for the current filters.
              </div>
            )}
          </div>

          <div className="grid gap-3 lg:col-span-2 lg:grid-cols-1">
            <SplitBar answered={m.answeredCalls} unanswered={m.unansweredCalls} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <MetricCard
                label="Productive conversations"
                value={productivePct}
                format="percent"
                sub={previous ? undefined : `${m.productiveCalls.toLocaleString()} calls — answered + > 30s`}
                previous={prevProductivePct}
                comparisonLabel={comparisonLabel}
                trend={series(perDay, (p) => safeDiv(p.engaged, p.rows) * 100)}
              />
              <MetricCard
                label="High intent providers"
                value={highIntentTotal}
                sub={previous ? undefined : "Intent score ≥ 5"}
                previous={prevHighIntent}
                comparisonLabel={comparisonLabel}
                trend={series(perDay, (p) => p.high_intent)}
              />

            </div>
          </div>
        </div>
      </MetricSection>

      <MetricSection
        title="Active hiring"
        subtitle="Vacancy-weighted (sum of num_vacancies_input)"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Active Openings"
            value={m.activeOpenings}
            sub="Vacancies currently hiring (post-campaign)"
            previous={prev(previous, "activeOpenings")}
            comparisonLabel={comparisonLabel}
          />
          <MetricCard
            label="Active Providers"
            value={m.jobsActive}
            sub="Companies actively hiring"
            previous={prev(previous, "jobsActive")}
            comparisonLabel={comparisonLabel}
          />
          <MetricCard
            label="New jobs posted"
            value={m.newJobsPosted}
            sub="Companies that posted new roles"
            previous={prev(previous, "newJobsPosted")}
            comparisonLabel={comparisonLabel}
          />
          <MetricCard
            label="New job openings"
            value={m.newOpenings}
            sub="New vacancies posted during calls"
            previous={prev(previous, "newOpenings")}
            comparisonLabel={comparisonLabel}
          />

        </div>
      </MetricSection>


      <MetricSection title="Call metrics" subtitle="Per call (raw rows)">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard
            label="Total calls"
            value={m.totalCalls}
            sub={previous ? undefined : "All dialled attempts"}
            previous={prev(previous, "totalCalls")}
            comparisonLabel={comparisonLabel}
            trend={series(perDay, (p) => p.rows)}
          />
          <MetricCard
            label="Answered"
            value={m.answeredCalls}
            sub={previous ? `${pickupPct.toFixed(1)}% pickup` : `${pickupPct.toFixed(1)}% pickup rate`}
            previous={prev(previous, "answeredCalls")}
            comparisonLabel={comparisonLabel}
            trend={series(perDay, (p) => p.answered)}
          />
          <MetricCard
            label="Unanswered"
            value={m.unansweredCalls}
            sub={previous ? undefined : "No pickup"}
            previous={prev(previous, "unansweredCalls")}
            comparisonLabel={comparisonLabel}
          />
          <MetricCard
            label="Productive conversations"
            value={productivePct}
            format="percent"
            sub={previous ? undefined : `${m.productiveCalls.toLocaleString()} calls — answered + > 30s`}
            previous={prevProductivePct}
            comparisonLabel={comparisonLabel}
            trend={series(perDay, (p) => safeDiv(p.engaged, p.rows) * 100)}
          />
          <MetricCard
            label="Avg call duration"
            value={`${m.avgDuration.toFixed(1)} sec`}
            sub={previous ? undefined : "Answered calls only"}
            previous={prev(previous, "avgDuration")}
            comparisonLabel={comparisonLabel}
          />
        </div>
      </MetricSection>
    </div>
  );
}
