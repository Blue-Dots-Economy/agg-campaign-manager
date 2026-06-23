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

export function DkbOverviewMetrics({ m }: { m: DkbMetrics }) {
  const productiveDenom = m.answeredCalls;
  const productivePct = productiveDenom > 0 ? (m.productiveCalls / productiveDenom) * 100 : 0;
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
        title="Outcome metrics — Companies"
        subtitle="Per unique company (deduped by contact phone)"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SegmentedBar
              title="Companies called"
              totalLabel="Unique phones"
              total={m.companiesCalled}
              segments={[
                { label: "Jobs confirmed active", value: m.jobsActive, color: "green" },
                { label: "Jobs confirmed closed", value: m.jobsClosed, color: "red" },
                { label: "Unresolved", value: m.companiesUnresolved, color: "amber" },
              ]}
            />
          </div>
          <StatTile
            icon="IconBriefcase"
            label="New jobs discussed"
            value={m.newJobsDiscussed}
            sub="Companies that mentioned a new role"
            accent="blue"
          />
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
