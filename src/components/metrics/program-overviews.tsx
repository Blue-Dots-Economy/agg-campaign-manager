import {
  MetricSection,
  RateDial,
  StatTile,
  SplitBar,
  SegmentedBar,
} from "@/components/metrics/primitives";
import { VerticalFunnel, type VerticalFunnelStage } from "@/components/metrics/VerticalFunnel";

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
}

export interface DkbProviderFunnelStage {
  key: string;
  label: string;
  providers: number;
  openings: number;
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
  providerFunnel?: DkbProviderFunnelStage[];
}

export function KkbOverviewMetrics({ m }: { m: KkbMetrics }) {
  const appRate = m.answeredSeekers > 0 ? (m.appliedSeekers / m.answeredSeekers) * 100 : 0;
  const productivePct = m.totalCalls > 0 ? (m.productiveCalls / m.totalCalls) * 100 : 0;

  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  const dropPct = (n: number, d: number) => (d > 0 ? Math.max(0, (1 - n / d) * 100) : 0);

  const stages: VerticalFunnelStage[] = [
    {
      key: "calls",
      label: "Calls made",
      description: "All dialled attempts",
      value: m.totalCalls,
      color: "blue",
      sub: "100.0%",
      nextAnnotation: `-${dropPct(m.answeredCalls, m.totalCalls).toFixed(1)}% no pickup`,
    },
    {
      key: "picked",
      label: "Picked up",
      description: "Seeker answered",
      value: m.answeredCalls,
      color: "green",
      nextAnnotation: `-${dropPct(m.engagedCalls, m.answeredCalls).toFixed(1)}% drop after pickup`,
    },
    {
      key: "engaged",
      label: "Engaged",
      description: "3+ real conversation turns",
      value: m.engagedCalls,
      color: "green",
      nextAnnotation: `-${dropPct(m.jobsShownCalls, m.engagedCalls).toFixed(1)}% don't reach jobs`,
    },
    {
      key: "jobs",
      label: "Jobs shown",
      description: "Bot presented openings",
      value: m.jobsShownCalls,
      color: "amber",
      nextAnnotation: "High-intent subset",
    },
    {
      key: "intent",
      label: "High-Intent (≥5)",
      description: "Intent score ≥ 5",
      value: m.highIntentCalls,
      color: "coral",
      nextAnnotation: `-${dropPct(m.applicationsTotal, m.highIntentCalls).toFixed(1)}% never apply`,
    },
    {
      key: "apps",
      label: "Applications",
      description: `${m.applicationsSubmitted.toLocaleString()} submitted + ${m.applicationsBlocked.toLocaleString()} blocked`,
      value: m.applicationsTotal,
      color: "coral",
      nextAnnotation: m.hasInterviewData
        ? `${pct(m.interviewCount, m.applicationsTotal).toFixed(1)}% → interview`
        : undefined,
    },
  ];
  if (m.hasInterviewData) {
    stages.push({
      key: "interview",
      label: "Interview",
      description: "Ghaziabad only",
      value: m.interviewCount,
      color: "purple",
    });
  }

  return (
    <div className="space-y-8">
      <MetricSection
        title="Outcome metrics"
        subtitle="Funnel from calls made to applications"
      >
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <VerticalFunnel stages={stages} />
          </div>
          <div className="grid gap-3 lg:col-span-2 lg:grid-cols-1">
            <StatTile
              icon="IconClock"
              label="Avg call duration"
              value={`${m.avgDuration.toFixed(1)} sec`}
              sub="Answered calls only"
              accent="blue"
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <StatTile
                icon="IconFileCheck"
                label="Total applications"
                value={m.totalApplications}
                sub="Across all calls"
                accent="blue"
              />
              <StatTile
                icon="IconUserOff"
                label="Did not apply"
                value={m.didNotApply}
                sub="Answered but did not apply"
                accent="red"
              />
            </div>
          </div>
        </div>
      </MetricSection>

      <MetricSection title="Call metrics" subtitle="Per call (raw rows)">
        <div className="grid gap-4 lg:grid-cols-3">
          <SplitBar answered={m.answeredCalls} unanswered={m.unansweredCalls} />
          <RateDial
            value={productivePct}
            label="Productive conversations"
            sub={`${m.productiveCalls.toLocaleString()} calls — answered + > 30s`}
            accent="amber"
          />
          <RateDial value={appRate} label="Application rate" sub="Applied / answered seekers" accent="green" />
        </div>
      </MetricSection>
    </div>
  );
}

export function DkbOverviewMetrics({ m }: { m: DkbMetrics }) {
  const productiveDenom = m.answeredCalls;
  const productivePct = productiveDenom > 0 ? (m.productiveCalls / productiveDenom) * 100 : 0;

  const funnelData = m.providerFunnel ?? [];
  const calledProviders = funnelData[0]?.providers ?? 0;
  const colors: FunnelColor[] = ["blue", "green", "green", "coral"];
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  const drop = (n: number, d: number) => (d > 0 ? Math.max(0, (1 - n / d) * 100) : 0);

  const funnelStages: VerticalFunnelStage[] = funnelData.map((s, i) => {
    const prev = i > 0 ? funnelData[i - 1] : undefined;
    const ofCalled = pct(s.providers, calledProviders);
    const step = i === 0 ? 0 : drop(s.providers, prev?.providers ?? 0);
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
    };
  });

  return (
    <div className="space-y-8">
      <MetricSection
        title="Outcome metrics — Openings"
        subtitle="Vacancy-weighted (sum of num_vacancies_input)"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SegmentedBar
              title="Total openings (before campaign)"
              totalLabel="Total"
              total={m.totalOpenings}
              segments={[
                { label: "Active", value: m.activeOpenings, color: "green" },
                { label: "Closed", value: m.closedOpenings, color: "red" },
                { label: "Unresolved", value: m.unresolvedOpenings, color: "amber" },
              ]}
            />
          </div>
          <StatTile
            icon="IconSparkles"
            label="New openings captured"
            value={m.newOpenings}
            sub="From new jobs posted"
            accent="blue"
          />
        </div>
      </MetricSection>

      <MetricSection
        title="DKB Provider Funnel"
        subtitle="Per unique provider (contact phone) — Called → Picked up → Engaged → Actively hiring"
      >
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            {funnelStages.length > 0 ? (
              <VerticalFunnel stages={funnelStages} />
            ) : (
              <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                No provider data available for the current filters.
              </div>
            )}
          </div>
          <div className="grid gap-3 lg:col-span-2 lg:grid-cols-1">
            <StatTile
              icon="IconBriefcase"
              label="New jobs discussed"
              value={m.newJobsDiscussed}
              sub="Providers that mentioned a new role"
              accent="blue"
            />
            <StatTile
              icon="IconSparkles"
              label="New openings captured"
              value={m.newOpenings}
              sub="Vacancies from new jobs posted"
              accent="green"
            />
          </div>
        </div>
      </MetricSection>


      <MetricSection title="Call metrics" subtitle="Per call (raw rows)">
        <div className="grid gap-4 lg:grid-cols-3">
          <SplitBar answered={m.answeredCalls} unanswered={m.unansweredCalls} />
          <RateDial
            value={productivePct}
            label="Productive conversations"
            sub={`${m.productiveCalls.toLocaleString()} calls — answered + > 30s`}
            accent="amber"
          />
          <StatTile
            icon="IconClock"
            label="Avg call duration"
            value={`${m.avgDuration.toFixed(1)} sec`}
            sub="Answered calls only"
            accent="blue"
          />
        </div>
      </MetricSection>
    </div>
  );
}
