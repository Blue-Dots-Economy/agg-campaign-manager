import { useMemo } from "react";
import { MetricCard } from "@/components/metrics/MetricCard";
import type { JobPost, Seeker } from "./mockData";
import { GapTable } from "./GapTable";
import { mockPrevious, mockTrend } from "./ecosystemHelpers";

export function SeekersTab({ jobs, seekers }: { jobs: JobPost[]; seekers: Seeker[] }) {
  const totals = useMemo(() => {
    const ids = new Set(seekers.map((s) => s.id));
    const users = new Set(seekers.map((s) => s.user_id));
    const orgs = new Set(seekers.map((s) => (s.organization_name || "").trim()).filter(Boolean));
    return { profiles: ids.size, users: users.size, orgs: orgs.size };
  }, [seekers]);

  // TODO(ecosystem): mock previous/trend — replace with real period-over-period data in Phase 3
  const profilesPrev = mockPrevious(totals.profiles, 0.86);
  const usersPrev = mockPrevious(totals.users, 0.9);
  const orgsPrev = mockPrevious(totals.orgs, 0.83);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Total Profiles"
          value={totals.profiles}
          sub="seeker profiles created"
          previous={profilesPrev}
          trend={mockTrend(totals.profiles, profilesPrev)}
        />
        <MetricCard
          label="Total Accounts"
          value={totals.users}
          sub="unique user accounts"
          previous={usersPrev}
          trend={mockTrend(totals.users, usersPrev)}
        />
        <MetricCard
          label="Total Orgs"
          value={totals.orgs}
          sub="affiliated institutions"
          previous={orgsPrev}
          trend={mockTrend(totals.orgs, orgsPrev)}
        />
      </div>
      <GapTable jobs={jobs} />
    </div>
  );
}
