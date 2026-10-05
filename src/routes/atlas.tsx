import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Radar, ShieldAlert, OctagonX, Info } from "lucide-react";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  atlasApproveCohort, atlasBuildCohort, atlasCancelCohort, atlasGetCohort,
  atlasGetControl, atlasListCohorts, atlasSetControl,
} from "@/lib/atlas.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/atlas")({
  head: () => ({
    meta: [
      { title: "ATLAS — Cohort Planner (Pilot)" },
      { name: "description", content: "Automated Targeting, Learning & Allocation System — shadow-mode cohort planner." },
      { property: "og:title", content: "ATLAS — Cohort Planner (Pilot)" },
      { property: "og:description", content: "Shadow-mode daily cohort planner with human review." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AtlasPage,
});

function AtlasPage() {
  const qc = useQueryClient();
  const getControl = useServerFn(atlasGetControl);
  const setControl = useServerFn(atlasSetControl);
  const build = useServerFn(atlasBuildCohort);
  const list = useServerFn(atlasListCohorts);
  const getCohort = useServerFn(atlasGetCohort);
  const approve = useServerFn(atlasApproveCohort);
  const cancel = useServerFn(atlasCancelCohort);

  const control = useQuery({ queryKey: ["atlas", "control"], queryFn: () => getControl() });
  const cohorts = useQuery({ queryKey: ["atlas", "cohorts"], queryFn: () => list() });
  const killed = control.data?.killed ?? false;

  const [program, setProgram] = useState<"kkb" | "dkb">("kkb");
  const [region, setRegion] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [budget, setBudget] = useState(1000);
  const [confidenceMin, setConfidenceMin] = useState(6);
  const [cooldownDays, setCooldownDays] = useState(30);
  const [maxCampaigns, setMaxCampaigns] = useState(3);
  const [explorePct, setExplorePct] = useState(15);
  const [urgencyWeight, setUrgencyWeight] = useState(30);
  const [urgencyMin, setUrgencyMin] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["atlas", "cohort", selectedId],
    queryFn: () => getCohort({ data: { id: selectedId! } }),
    enabled: !!selectedId,
  });

  const killMut = useMutation({
    mutationFn: (k: boolean) => setControl({ data: { killed: k } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atlas", "control"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const buildMut = useMutation({
    mutationFn: () => build({ data: { program, region: region || null, budget: Math.min(budget, 1000), confidenceMin, cooldownDays, maxCampaigns, explorePct, urgencyWeight, urgencyMin: urgencyMin === "" ? null : Number(urgencyMin) } }),
    onSuccess: (r) => {
      if (r.regions.length) setRegions(r.regions);
      setSelectedId(r.cohortId);
      qc.invalidateQueries({ queryKey: ["atlas", "cohorts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshAfter = () => {
    qc.invalidateQueries({ queryKey: ["atlas", "cohorts"] });
    qc.invalidateQueries({ queryKey: ["atlas", "cohort", selectedId] });
  };
  const approveMut = useMutation({
    mutationFn: (id: string) => approve({ data: { id } }),
    onSuccess: (r) => { toast.success(r.message); refreshAfter(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancel({ data: { id } }),
    onSuccess: () => { toast("Cohort cancelled."); refreshAfter(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const c = detail.data?.cohort;
  const members = detail.data?.members ?? [];
  const exploreCount = members.filter((m) => m.is_exploration).length;
  const fairness = (c?.fairness ?? null) as null | { byRegion: Record<string, number>; byCategory: Record<string, number>; categoryAvailable: boolean; note: string | null };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Radar className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-[0.2em] text-foreground">ATLAS</h1>
            <p className="text-sm text-muted-foreground">Automated Targeting, Learning &amp; Allocation System · Mark I</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="rounded-lg border-2 border-dashed border-primary/60 bg-primary/5 px-4 py-2 text-right">
            <div className="text-xs font-bold uppercase tracking-widest text-primary">Shadow mode</div>
            <div className="text-xs text-muted-foreground">Proposes cohorts — places no calls</div>
          </div>
          <Badge variant={killed ? "destructive" : "secondary"}>{killed ? "Halted" : "Running"}</Badge>
        </div>
      </div>

      <Panel title="Kill switch" description="Halting stops ATLAS from building or approving anything.">
        <div className={cn("flex items-center justify-between rounded-lg border p-4", killed && "border-destructive bg-destructive/10")}>
          <div className="flex items-center gap-3">
            <OctagonX className={cn("h-5 w-5", killed ? "text-destructive" : "text-muted-foreground")} />
            <div>
              <div className="text-sm font-semibold">Halt ATLAS</div>
              <div className="text-xs text-muted-foreground">{killed ? "ATLAS is halted. Nothing will be built until you resume." : "ATLAS is available to propose cohorts."}</div>
            </div>
          </div>
          <Switch checked={killed} disabled={control.isLoading || killMut.isPending} onCheckedChange={(v) => killMut.mutate(v)} className="data-[state=checked]:bg-destructive" aria-label="Halt ATLAS" />
        </div>
      </Panel>

      <Panel title="Cohort planner" description="Set today's constraints. I'll propose who to call and explain why.">
        <div className="divide-y divide-border">
          <Group title="Who to call" className="pb-5">
            <FieldShell label="Program" caption="Which program's records to draw from.">
              <div className="flex h-9 w-full items-center rounded-md border p-1">
                {(["kkb", "dkb"] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setProgram(p)} className={cn("h-full flex-1 rounded py-1 text-xs font-medium uppercase", program === p ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{p}</button>
                ))}
              </div>
            </FieldShell>
            <FieldShell label="Region" caption="Leave blank to include every region.">
              <Input list="atlas-regions" className="h-9" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="All regions" />
              <datalist id="atlas-regions">{regions.map((r) => <option key={r} value={r} />)}</datalist>
            </FieldShell>
            <NumField label="Confidence ≥ (0–10)" value={confidenceMin} min={0} max={10} step={0.5} onChange={setConfidenceMin} caption="Lowest match confidence to include." />
            <NumField label="Cooldown days" value={cooldownDays} min={0} onChange={setCooldownDays} caption="Skip anyone called more recently." />
            <NumField label="Max campaigns run" value={maxCampaigns} min={0} onChange={setMaxCampaigns} caption="Skip anyone already called too often." />
            <NumField label="Min urgency" value={urgencyMin} min={-2} max={5} step={0.5} onChange={setUrgencyMin} placeholder="No filter"
              caption="Only seekers matched to a job at or above this urgency."
              hint="Only include seekers matched to a job at or above this urgency (scale −2 to 5). Leave blank to include everyone. Changes who's included." />
          </Group>

          <Group title="How to prioritise" className="py-5">
            <NumField label="Urgency weight" value={urgencyWeight} min={0} max={60} onChange={setUrgencyWeight}
              caption="Lifts urgent seekers up the order."
              hint="How much job urgency lifts a seeker's ranking (0 = ignore). Changes the order, not who's included." />
            <NumField label="Exploration %" value={explorePct} min={0} max={50} onChange={setExplorePct}
              caption="Share held back for the least-contacted." />
          </Group>

          <Group title="Size" className="pt-5">
            <NumField label="Budget (max 1000)" value={budget} min={1} max={1000} onChange={(v) => setBudget(Math.min(v, 1000))}
              caption="Most people ATLAS may propose today." />
          </Group>
        </div>

        <Button className="mt-6 w-full" disabled={killed || buildMut.isPending} onClick={() => buildMut.mutate()}>
          {buildMut.isPending ? "Thinking…" : "Build today's cohort"}
        </Button>
        {killed && <p className="mt-3 text-xs text-destructive">ATLAS is halted — resume it above to build a cohort.</p>}
      </Panel>

      {selectedId && (
        <Panel title="Proposal" description={c ? `${c.program?.toUpperCase()} · ${c.region || "All regions"} · ${new Date(c.created_at).toLocaleString()} · ${c.status}` : undefined}>
          {detail.isLoading || !c ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-5">
              <blockquote className="rounded-lg border-l-4 border-primary bg-muted/40 p-4 text-sm leading-relaxed italic text-foreground">
                {c.narration}
                <div className="mt-2 text-xs not-italic text-muted-foreground">— ATLAS</div>
              </blockquote>

              <div className="text-lg text-foreground">
                ATLAS would call <span className="font-bold">{c.total_count}</span> people
                <span className="text-sm text-muted-foreground"> · {exploreCount} of {members.length} previewed are exploration picks</span>
              </div>

              {fairness && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Dist title="By region (preview)" data={fairness.byRegion} />
                  {fairness.categoryAvailable ? (
                    <Dist title="By category (preview)" data={fairness.byCategory} />
                  ) : (
                    <div className="rounded-lg border border-dashed p-3 text-sm">
                      <div className="mb-1 flex items-center gap-2 font-semibold"><ShieldAlert className="h-4 w-4" />By category</div>
                      <p className="text-muted-foreground">{fairness.note}</p>
                    </div>
                  )}
                </div>
              )}

              {members.length > 0 && members.every((m) => m.urgency == null) && (
                <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  Urgency data not yet populated — ranking is using confidence, intent and history. It will factor in automatically once available.
                </p>
              )}
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <caption className="caption-bottom p-2 text-xs text-muted-foreground">
                    Representative preview of {c.total_count} — full list is resolved only at dispatch (disabled in this version).
                  </caption>
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>{["Phone", "Region", "Category", "Conf.", "Campaigns", "Last call", "Urgency", "Priority", "Why"].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{m.phone_masked}</td>
                        <td className="px-3 py-2">{m.region || "—"}</td>
                        <td className="px-3 py-2">{m.category || "—"}</td>
                        <td className="px-3 py-2">{m.confidence ?? "—"}</td>
                        <td className="px-3 py-2">{m.total_campaigns}</td>
                        <td className="px-3 py-2">{m.last_call_date || "—"}</td>
                        <td className="px-3 py-2 align-top">
                          {m.urgency == null ? <span className="text-muted-foreground">—</span> : (
                            <div className="flex flex-col gap-1">
                              <span className="flex items-center gap-1.5">
                                <span className="font-semibold">{m.urgency}</span>
                                {m.is_urgent && <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400">Urgent</Badge>}
                              </span>
                              {m.urgency_reason && <span className="text-xs text-muted-foreground">{m.urgency_reason}</span>}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-semibold">{m.priority_score}</td>
                        <td className="px-3 py-2">
                          {m.is_exploration && <Badge variant="outline" className="mr-2">exploration</Badge>}
                          <span className="text-muted-foreground">{m.reason}</span>
                        </td>
                      </tr>
                    ))}
                    {members.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">No preview rows.</td></tr>}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button disabled={killed || c.status !== "proposed" || approveMut.isPending} onClick={() => approveMut.mutate(c.id)}>Approve (shadow — no calls)</Button>
                <Button variant="outline" disabled={c.status === "cancelled" || cancelMut.isPending} onClick={() => cancelMut.mutate(c.id)}>Cancel</Button>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild><span><Button variant="secondary" disabled>Dispatch</Button></span></TooltipTrigger>
                    <TooltipContent>Enabled in a later version once ATLAS is verified.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          )}
        </Panel>
      )}

      <Panel title="Recent cohorts">
        <div className="divide-y rounded-lg border">
          {(cohorts.data ?? []).map((r) => (
            <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50", selectedId === r.id && "bg-muted/60")}>
              <span>{new Date(r.created_at).toLocaleString()} · {String(r.program).toUpperCase()} · {r.region || "All regions"}</span>
              <span className="flex items-center gap-2 text-muted-foreground">{r.total_count} people <Badge variant="outline">{r.status}</Badge></span>
            </button>
          ))}
          {!cohorts.isLoading && (cohorts.data ?? []).length === 0 && <p className="p-3 text-sm text-muted-foreground">No cohorts yet.</p>}
        </div>
      </Panel>
    </div>
  );
}

// Labeled sub-group inside the planner card: subtle heading + aligned control grid.
function Group({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn("space-y-3", className)}>
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-2 items-start gap-x-4 gap-y-5 md:grid-cols-3">{children}</div>
    </section>
  );
}

// Shared shell so every control has the same label row, control height and caption slot.
function FieldShell({ label, caption, hint, children }: { label: string; caption?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-5 items-center gap-1.5">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label={`About ${label}`} className="shrink-0 rounded text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-xs leading-relaxed">{hint}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {children}
      <p className="min-h-[2.4rem] text-xs leading-snug text-muted-foreground">{caption}</p>
    </div>
  );
}

type NumFieldProps = {
  label: string; min?: number; max?: number; step?: number; placeholder?: string;
  caption?: string; hint?: string;
} & ({ value: number; onChange: (v: number) => void } | { value: string; onChange: (v: string) => void });

// Blank stays blank for the string form (min urgency = "no filter").
function NumField({ label, value, onChange, min, max, step, placeholder, caption, hint }: NumFieldProps) {
  const isText = typeof value === "string";
  return (
    <FieldShell label={label} caption={caption} hint={hint}>
      <Input className="h-9" type="number" value={value} min={min} max={max} step={step} placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          if (isText) (onChange as (v: string) => void)(raw);
          else (onChange as (v: number) => void)(raw === "" ? 0 : Number(raw));
        }} />
    </FieldShell>
  );
}

function Dist({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="mb-2 font-semibold">{title}</div>
      <div className="space-y-1.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-28 truncate text-muted-foreground">{k}</span>
            <div className="h-2 flex-1 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${(v / total) * 100}%` }} /></div>
            <span className="w-8 text-right">{v}</span>
          </div>
        ))}
        {entries.length === 0 && <p className="text-muted-foreground">No data.</p>}
      </div>
    </div>
  );
}
