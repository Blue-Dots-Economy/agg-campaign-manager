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
    <Tabs defaultValue="jobs" className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap items-center gap-2">
          <RegionSelector value={region} onChange={setRegion} />
          <TabsList>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="seekers">Seekers</TabsTrigger>
          </TabsList>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            Synced 2h ago
          </Badge>
          {/* TODO(ecosystem): Phase 3 — wire Sync Now to real Supabase trigger */}
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            Sync Now
          </Button>
        </div>
      </div>

      <TabsContent value="jobs" className="space-y-6 mt-0">
        <JobsTab jobs={jobs} applications={applications} totalSeekers={seekers.length} />
      </TabsContent>
      <TabsContent value="seekers" className="space-y-6 mt-0">
        <SeekersTab jobs={jobs} seekers={seekers} />
      </TabsContent>
    </Tabs>
  );
}
