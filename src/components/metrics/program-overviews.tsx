import {
  MetricSection,
  ConversionFunnel,
  RateDial,
  StatTile,
  SplitBar,
  SegmentedBar,
} from "@/components/metrics/primitives";

export interface KkbMetrics {
  totalCalls: number;
  answeredCalls: number;
  unansweredCalls: number;
  productiveCalls: number;
  avgDuration: number;
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
  const failedOfTried = m.triedSeekers > 0 ? (m.failedSeekers / m.triedSeekers) * 100 : 0;
  const productivePct = m.totalCalls > 0 ? (m.productiveCalls / m.totalCalls) * 100 : 0;
  return (
    <div className="space-y-8">
      <MetricSection
        title="Outcome metrics"
        subtitle="Per unique job seeker (deduped by phone)"
      >
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ConversionFunnel
              stages={[
                { label: "Seekers called", value: m.seekers, color: "blue" },
                { label: "Answered", value: m.answeredSeekers, color: "blue" },
                { label: "Tried (applied + failed)", value: m.triedSeekers, color: "amber" },
                { label: "Applied", value: m.appliedSeekers, color: "green" },
              ]}
            />
          </div>
          <div className="grid gap-3 lg:col-span-2 lg:grid-cols-1">
            <RateDial value={appRate} label="Application rate" sub="Applied / answered seekers" accent="green" />
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <StatTile
                icon="IconFileCheck"
                label="Total applications"
                value={m.totalApplications}
                sub="Across all calls"
                accent="blue"
              />
              <StatTile
                icon="IconAlertTriangle"
                label="Failed attempts"
                value={m.failedSeekers}
                sub={`${failedOfTried.toFixed(1)}% of those who tried`}
                accent="amber"
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
