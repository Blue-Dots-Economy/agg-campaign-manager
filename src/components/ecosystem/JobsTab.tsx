import { useMemo } from "react";
import { MetricCard } from "@/components/metrics/MetricCard";
import type { Application, JobPost } from "./mockData";
import { GapTable } from "./GapTable";

export function JobsTab({
  jobs,
  applications,
  totalSeekers,
}: {
  jobs: JobPost[];
  applications: Application[];
  totalSeekers: number;
}) {
  const open = useMemo(() => jobs.filter((j) => j.status === "open"), [jobs]);
  const providers = useMemo(() => new Set(open.map((j) => j.posted_by)).size, [open]);
  const openings = useMemo(() => open.reduce((s, j) => s + j.current_openings, 0), [open]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Job Providers" value={providers} />
        <MetricCard label="Job Openings" value={openings} />
        <MetricCard label="Total Applications" value={applications.length} />
        <MetricCard label="Job Seekers" value={totalSeekers} />
      </div>
      <GapTable jobs={jobs} />
    </div>
  );
}
