import { useMemo } from "react";
import { MetricCard } from "@/components/metrics/MetricCard";
import type { JobPost, Seeker } from "./mockData";
import { GapTable } from "./GapTable";

export function SeekersTab({ jobs, seekers }: { jobs: JobPost[]; seekers: Seeker[] }) {
  const totals = useMemo(() => {
    const ids = new Set(seekers.map((s) => s.id));
    const users = new Set(seekers.map((s) => s.user_id));
    const orgs = new Set(seekers.map((s) => (s.organization_name || "").trim()).filter(Boolean));
    return { profiles: ids.size, users: users.size, orgs: orgs.size };
  }, [seekers]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Total Profiles" value={totals.profiles} />
        <MetricCard label="Total Accounts" value={totals.users} />
        <MetricCard label="Total Orgs" value={totals.orgs} />
      </div>
      <GapTable jobs={jobs} />
    </div>
  );
}
