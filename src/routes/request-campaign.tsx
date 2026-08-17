import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Rocket, Check, FileText, Loader2 } from "lucide-react";
import { useProgram } from "@/programs/context";
import { registry } from "@/programs/registry";
import { useProgramOverrides } from "@/lib/program-overrides";
import { useAuth } from "@/auth/context";
import { submitCampaignRequest } from "@/lib/campaign-requests.functions";
import { listProgramAgents } from "@/lib/agents.functions";
import { buildCohort, type CohortIntent, type ConfidenceBand } from "@/lib/cohort";
import { loadSeekersAsync, type Seeker } from "@/lib/upSeekersCsv";
import { ScheduleEditor, type ScheduleState, makeDefaultSchedule } from "@/components/ScheduleEditor";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/request-campaign")({
  component: RequestCampaignForm,
  head: () => ({
    meta: [
      { title: "Request a campaign · Operation Rozgar" },
      { name: "description", content: "Coordinators request an outreach campaign: pick the goal, audience and call window for a JFC to review and launch." },
      { property: "og:title", content: "Request a campaign · Operation Rozgar" },
      { property: "og:description", content: "Coordinators request an outreach campaign: pick the goal, audience and call window for a JFC to review and launch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUSES = ["New", "Active", "At Risk", "Inactive"];
const BANDS: { id: ConfidenceBand; label: string }[] = [
  { id: "low", label: "Low (< 40)" },
  { id: "medium", label: "Medium (40–70)" },
  { id: "high", label: "High (> 70)" },
];

function RequestCampaignForm() {
  const { programId } = useProgram();
  const program = programId;
  const overrides = useProgramOverrides(program);
  const { session } = useAuth();

  const [campaignName, setCampaignName] = useState("");
  const [intent, setIntent] = useState<CohortIntent>("drive");
  const [profileStatuses, setProfileStatuses] = useState<string[]>(["Active", "At Risk"]);
  const [confidenceBand, setConfidenceBand] = useState<ConfidenceBand>("low");
  const [schedule, setSchedule] = useState<ScheduleState>(() => makeDefaultSchedule());
  const [note, setNote] = useState("");
  const [seekers, setSeekers] = useState<Seeker[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submitFn = useServerFn(submitCampaignRequest);
  const listAgentsFn = useServerFn(listProgramAgents);
  const [agentId, setAgentId] = useState<string>("");
  const [agentName, setAgentName] = useState<string>("");

  useEffect(() => {
    if (!seekers && !loading) {
      setLoading(true);
      loadSeekersAsync().then((r) => setSeekers(r.seekers)).catch(() => setSeekers([])).finally(() => setLoading(false));
    }
  }, [seekers, loading]);

  // Resolve a default agent silently (coordinator doesn't choose one; JFC can see it at approval).
  useEffect(() => {
    let cancelled = false;
    listAgentsFn({ data: { program } }).then((agents) => {
      if (cancelled) return;
      const first = agents?.[0];
      setAgentId(first?.agent_id || overrides.rayaAgentId || registry[program].rayaAgentId || "");
      setAgentName(first?.name || "");
    }).catch(() => {
      setAgentId(overrides.rayaAgentId || registry[program].rayaAgentId || "");
    });
    return () => { cancelled = true; };
  }, [program, listAgentsFn, overrides.rayaAgentId]);

  const cohortContacts = useMemo(
    () => (seekers ? buildCohort(seekers, { intent, profileStatuses, confidenceBand }) : []),
    [seekers, intent, profileStatuses, confidenceBand],
  );

  const campaignType = useMemo(() => {
    const tag = intent === "drive" ? "DriveApplications" : "FillInfo";
    return `${program.toUpperCase()}_Hindi_${tag}_Day1`;
  }, [program, intent]);

  const toggleStatus = (s: string) =>
    setProfileStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const canSubmit = campaignName.trim().length > 0 && cohortContacts.length > 0 && !!agentId && !submitting;

  const submit = async () => {
    if (!agentId) { toast.error("No agent configured for this program — ask an admin to add one in Settings."); return; }
    if (cohortContacts.length === 0) { toast.error("No seekers match — widen the filter."); return; }
    setSubmitting(true);
    try {
      await submitFn({
        data: {
          request: {
            program,
            agent_id: agentId,
            agent_name: agentName,
            batch_name: campaignName.trim(),
            campaign_day: "Day 1",
            campaign_date: new Date().toISOString().slice(0, 10),
            campaign_type: campaignType,
            region: "GZB",
            language: "Hindi",
            city_campaign: "Ghaziabad",
            channel: "outbound",
            source: "cohort",
            cohort_intent: intent,
            cohort_filters: intent === "drive" ? { profileStatuses } : { confidenceBand },
            contacts: cohortContacts.map((c) => ({ ...c, _region: "GZB" })),
            schedule: {
              timezone: schedule.timezone,
              start_time: schedule.startTime,
              end_time: schedule.endTime,
              days: schedule.days,
            },
            concurrency: null,
            max_retries: null,
            retry_after_hrs: null,
            selected_statuses: ["Pending"],
            requested_by: session?.email ?? "",
            note: note.trim() || null,
          },
        },
      });
      setSubmitted(true);
      toast.success("Request submitted — it'll appear in Campaign Requests for a JFC/admin to review and launch.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-6 max-w-2xl">
        <Panel>
          <div className="flex items-center gap-2 text-brand">
            <Check className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Request submitted</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            "{campaignName}" is now pending review. A JFC or admin will set the calling details and launch it. You'll see it in the Campaign Requests queue.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => { setSubmitted(false); setCampaignName(""); setNote(""); }}>
            Request another
          </Button>
        </Panel>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><Rocket className="h-5 w-5" /> Request a campaign</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Tell us the goal and who to call. A JFC or admin sets the calling details and launches it.
        </p>
      </div>

      <Panel title="Campaign name" description="A short name so the JFC knows what this is">
        <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g. Ghaziabad Day 3 — drive applications" className="max-w-md" />
      </Panel>

      <Panel title="Goal" description="What should this campaign achieve?">
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            { id: "drive", icon: Rocket, title: "Drive Applications", desc: "Call seekers to push them to apply." },
            { id: "fill", icon: FileText, title: "Fill Missing Information", desc: "Call seekers to complete their profile." },
          ] as const).map((o) => (
            <button key={o.id} onClick={() => setIntent(o.id)} className={cn(
              "rounded-xl border-2 p-4 text-left transition-colors flex items-start gap-3",
              intent === o.id ? "border-brand bg-brand-soft" : "border-border bg-card hover:bg-muted/40")}>
              <span className="mt-0.5 text-brand"><o.icon className="h-5 w-5" /></span>
              <span>
                <span className="flex items-center gap-2 text-sm font-semibold">{o.title}
                  {o.id === "fill" && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">Mock</span>}
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">{o.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="Which seekers" description="Pick the audience from your Blue Dots">
        {intent === "drive" ? (
          <div>
            <Label className="text-xs">Profile status · select one or more</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {STATUSES.map((s) => {
                const on = profileStatuses.includes(s);
                return (
                  <button key={s} type="button" onClick={() => toggleStatus(s)} className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5",
                    on ? "border-brand bg-brand text-brand-foreground hover:bg-brand/90" : "border-border bg-card text-muted-foreground hover:bg-muted/40")}>
                    {on && <Check className="h-3 w-3" />}{s}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              Confidence score isn't in the data yet — this is a mock using profile completeness as a stand-in until the field lands.
            </div>
            <Label className="text-xs">Confidence score · target a band</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {BANDS.map((b) => {
                const on = confidenceBand === b.id;
                return (
                  <button key={b.id} type="button" onClick={() => setConfidenceBand(b.id)} className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5",
                    on ? "border-brand bg-brand text-brand-foreground hover:bg-brand/90" : "border-border bg-card text-muted-foreground hover:bg-muted/40")}>
                    {on && <Check className="h-3 w-3" />}{b.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="mt-4 flex items-baseline gap-2 border-t border-border pt-3">
          {loading ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading your Blue Dots…</span>
          ) : (
            <>
              <span className="text-2xl font-semibold tabular-nums">{cohortContacts.length.toLocaleString("en-IN")}</span>
              <span className="text-sm text-muted-foreground">seekers match — they'll be called</span>
            </>
          )}
        </div>
      </Panel>

      <Panel title="When" description="Preferred call window (the JFC can fine-tune this)">
        <ScheduleEditor value={schedule} onChange={setSchedule} />
      </Panel>

      <Panel title="Note for the JFC" description="Optional — anything the reviewer should know">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="e.g. Please prioritise this week; these seekers went quiet after Day 1." className="max-w-lg" />
      </Panel>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={!canSubmit} size="lg" className="bg-brand text-brand-foreground hover:bg-brand/90 gap-1.5">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Submit request
        </Button>
        <span className="text-xs text-muted-foreground">Requesting as {session?.email ?? "you"}</span>
      </div>
    </div>
  );
}
