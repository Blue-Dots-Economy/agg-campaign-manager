import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { previewMasterCohort, type MasterFilters } from "@/lib/master-cohort.functions";

export interface PickResolved {
  filters: MasterFilters;
  region: string;
  count: number;
}

export function PickAudience({ program, onResolved }: { program: "kkb" | "dkb"; onResolved: (r: PickResolved) => void }) {
  const previewFn = useServerFn(previewMasterCohort);
  const [region, setRegion] = useState("");
  const [confidenceMin, setConfidenceMin] = useState<number | null>(null);
  const [maxCampaigns, setMaxCampaigns] = useState<number | null>(null);
  const [cooldownDays, setCooldownDays] = useState<number | null>(null);
  const [lockedCount, setLockedCount] = useState<number | null>(null);

  const filters: MasterFilters = useMemo(() => ({
    program, confidenceMin, maxCampaigns, cooldownDays,
    region: region || null, status: null,
  }), [program, confidenceMin, maxCampaigns, cooldownDays, region]);

  const previewQuery = useQuery({
    queryKey: ["master-cohort-preview", filters],
    queryFn: () => previewFn({ data: filters }),
    staleTime: 15_000,
  });
  const preview = previewQuery.data;

  const numInput = (v: number | null, set: (n: number | null) => void, ph: string) => (
    <Input type="number" min={0} value={v ?? ""} placeholder={ph}
      onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))} />
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="text-xs">Region</Label>
          <Select value={region || "__all"} onValueChange={(v) => setRegion(v === "__all" ? "" : v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="All regions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All regions</SelectItem>
              {(preview?.regions ?? []).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Confidence ≥ (0–10)</Label>
          <Input className="mt-1" type="number" min={0} max={10} step={0.5}
            disabled={preview ? !preview.confidenceAvailable : true}
            value={confidenceMin ?? ""} placeholder="e.g. 6"
            onChange={(e) => setConfidenceMin(e.target.value === "" ? null : Number(e.target.value))} />
          {preview && !preview.confidenceAvailable && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Confidence not scored yet — activates once populated.</p>
          )}
        </div>
        <div><Label className="text-xs">Max campaigns run</Label><div className="mt-1">{numInput(maxCampaigns, setMaxCampaigns, "e.g. 3")}</div></div>
        <div><Label className="text-xs">Cooldown days</Label><div className="mt-1">{numInput(cooldownDays, setCooldownDays, "e.g. 14")}</div></div>
      </div>

      <div className="flex items-center gap-3 flex-wrap border-t border-border pt-3">
        <span className="text-sm font-medium">
          {previewQuery.isLoading
            ? <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Counting…</span>
            : <><strong className="text-2xl tabular-nums">{(preview?.total ?? 0).toLocaleString("en-IN")}</strong> people match</>}
        </span>
        <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90"
          disabled={!preview || preview.total === 0}
          onClick={() => {
            const count = preview?.total ?? 0;
            setLockedCount(count);
            onResolved({ filters, region, count });
            toast.success(`Audience locked in · ${count} people`);
          }}>
          <Check className="h-4 w-4 mr-1" /> Use this audience
        </Button>
        {lockedCount != null && <span className="text-xs text-brand">Locked in · {lockedCount} contacts</span>}
      </div>

      {(preview?.sample?.length ?? 0) > 0 && (
        <div className="max-h-64 overflow-auto rounded-md border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Phone</TableHead><TableHead>Region</TableHead><TableHead>Confidence</TableHead><TableHead>Campaigns</TableHead><TableHead>Last call</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {preview!.sample.map((p, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{p.phone_masked}</TableCell>
                  <TableCell>{p.region || "—"}</TableCell>
                  <TableCell>{p.confidence ?? "—"}</TableCell>
                  <TableCell>{p.total_campaigns}</TableCell>
                  <TableCell className="text-xs">{p.last_call_date || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
