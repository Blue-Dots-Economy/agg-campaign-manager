import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RegionSelector, type RegionValue } from "@/components/ecosystem/RegionSelector";
import { JobsTab } from "@/components/ecosystem/JobsTab";
import { SeekersTab } from "@/components/ecosystem/SeekersTab";
import {
  MOCK_APPLICATIONS,
  MOCK_JOBS,
  MOCK_SEEKERS,
  REGION_TREE,
} from "@/components/ecosystem/mockData";

export const Route = createFileRoute("/ecosystem-view")({
  component: EcosystemView,
  head: () => ({
    meta: [
      { title: "Ecosystem View · Rozgar Hub" },
      { name: "description", content: "Unified job provider, seeker, and institution view by district." },
      { property: "og:title", content: "Ecosystem View · Rozgar Hub" },
      { property: "og:description", content: "Unified job provider, seeker, and institution view by district." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function EcosystemView() {
  const [region, setRegion] = useState<RegionValue>({
    state: REGION_TREE[0].state,
    district: REGION_TREE[0].districts[0],
  });

  const jobs = useMemo(
    () => MOCK_JOBS.filter((j) => j.location_state === region.state && j.location_district === region.district),
    [region]
  );
  const jobIds = useMemo(() => new Set(jobs.map((j) => j.id)), [jobs]);
  const applications = useMemo(() => MOCK_APPLICATIONS.filter((a) => jobIds.has(a.job_id)), [jobIds]);
  const seekers = useMemo(
    () => MOCK_SEEKERS.filter((s) => s.location_state === region.state && s.location_district === region.district),
    [region]
  );

  return (
    <div className="space-y-6 px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ecosystem View</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Job providers, seekers and institutions — scoped to a district.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RegionSelector value={region} onChange={setRegion} />
          <Badge variant="outline" className="text-xs">Synced 2h ago</Badge>
          {/* TODO(ecosystem): Phase 3 — wire Sync Now to real Supabase trigger */}
          <Button size="sm" variant="outline">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Sync Now
          </Button>
        </div>
      </header>

      <Tabs defaultValue="jobs" className="space-y-6">
        <TabsList>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="seekers">Seekers</TabsTrigger>
        </TabsList>
        <TabsContent value="jobs" className="space-y-6">
          <JobsTab jobs={jobs} applications={applications} totalSeekers={seekers.length} />
        </TabsContent>
        <TabsContent value="seekers" className="space-y-6">
          <SeekersTab seekers={seekers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
