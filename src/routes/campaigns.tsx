import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useProgram } from "@/programs/context";
import { type CallRow } from "@/programs/data";
import { useProgramAggregates } from "@/programs/useProgramAggregates";
import { Panel } from "@/components/Panel";
import { NoDataState, LoadingState } from "@/components/EmptyState";
import { getCallDetailFn } from "@/lib/connections.functions";
import { fetchCampaignDayRowsFn } from "@/lib/snapshot.functions";
import {
  listProgramLiveBatches,
  getBatchLiveDetail,
  type LiveBatch,
} from "@/lib/raya-live.functions";
import { rayaStopBatch } from "@/lib/raya.functions";
import { exportBatchToStaging } from "@/lib/raya-export.functions";
import { ExternalLink, ShieldAlert } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

export const Route = createFileRoute("/campaigns")({
  component: Campaigns,
});

const RUNNING_STATUSES = new Set([
  "running", "in_progress", "in progress", "processing", "active", "live", "started",
]);

function statusBadgeClass(status: string): string {
  if (RUNNING_STATUSES.has(status)) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (status === "scheduled" || status === "queued" || status === "pending") return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
  if (status === "stopping" || status === "paused") return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30";
  if (status === "completed" || status === "finished") return "bg-brand-soft text-brand border-brand/30";
  if (status === "stopped" || status === "failed") return "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function maskPhone(p: string): string {
  if (!p) return "—";
  if (p.length <= 4) return p;
  return p.slice(0, p.length - 6).replace(/\d/g, "•") + p.slice(-4).padStart(6, "•");
}

function formatSchedule(s: any): string {
  if (!s) return "—";
  const days = Array.isArray(s.days) ? s.days : [];
  const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayStr = days.map((d: number) => dayNames[d] ?? d).join(", ");
  return `${dayStr || "—"} · ${s.start_time ?? "?"}–${s.end_time ?? "?"} ${s.timezone ?? ""}`.trim();
}

function useTabVisible() {
  const [visible, setVisible] = useState(
    typeof document !== "undefined" ? !document.hidden : true,
  );
  useEffect(() => {
    const h = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);
  return visible;
}



function Campaigns() {
  const { config } = useProgram();
  const query = useProgramAggregates(config);
  const data = query.data;
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [openCall, setOpenCall] = useState<CallRow | null>(null);

  const isDkb = config.id === "dkb";

  const dayRowsFn = useServerFn(fetchCampaignDayRowsFn);
  const dayQuery = useQuery({
    enabled: !!openDay,
    queryKey: ["campaign-day-rows", config.id, openDay],
    queryFn: () => dayRowsFn({ data: { program: config.id, day: openDay! } }),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const dayRows = dayQuery.data?.rows ?? [];

  const detailRows: CallRow[] = useMemo(() => {
    if (!openDay) return [];
    if (!filter) return dayRows;
    const q = filter.toLowerCase();
    return dayRows.filter((r) => {
      if (isDkb) {
        const raw = r.raw ?? {};
        return (
          (raw.contact_phone ?? "").toLowerCase().includes(q) ||
          (raw.company_name ?? "").toLowerCase().includes(q) ||
          (raw.job_role_input ?? "").toLowerCase().includes(q) ||
          (raw.call_status ?? "").toLowerCase().includes(q) ||
          (raw.job_status ?? "").toLowerCase().includes(q)
        );
      }
      return (
        r.seeker_name.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        r.call_outcome.toLowerCase().includes(q) ||
        (r.drop_reason ?? "").toLowerCase().includes(q)
      );
    });
  }, [dayRows, openDay, filter, isDkb]);

  const successLabel = isDkb
    ? "New jobs"
    : config.successMetric === "applications"
      ? "Applied"
      : "Interviews";

  const [openLiveBatch, setOpenLiveBatch] = useState<LiveBatch | null>(null);

  const campaigns = data?.campaigns ?? [];
  const hasHistoric = data && data.source !== "empty" && data.totalRows > 0;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Live data comes from Raya in real time. Past campaigns come from the synced sheet.
      </p>

      <LiveBatchesSection
        program={config.id}
        onOpen={(b) => setOpenLiveBatch(b)}
      />

      {query.isLoading && !data ? (
        <LoadingState />
      ) : !hasHistoric ? (
        <Panel title="Past campaigns" description="No historical campaign days yet.">
          <NoDataState />
        </Panel>
      ) : (
      <Panel title="Past campaigns" description={`${campaigns.length} campaign days · ${data!.totalRows} calls in snapshot`}>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Language</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Answered %</TableHead>
                <TableHead className="text-right">{successLabel}</TableHead>
                <TableHead className="text-right">High-intent</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c, i) => (
                <TableRow
                  key={`${c.day}|${c.type}|${c.language}|${i}`}
                  className="cursor-pointer"
                  onClick={() => setOpenDay(c.day)}
                >
                  <TableCell className="font-medium">{c.day}</TableCell>
                  <TableCell>{c.date}</TableCell>
                  <TableCell>{c.type}</TableCell>
                  <TableCell>{c.language}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.rows}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.answered_pct}%</TableCell>
                  <TableCell className="text-right tabular-nums">{isDkb ? c.new_jobs : c.converted}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.high_intent}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-brand-soft text-brand">
                      done
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
      )}




      <Dialog open={!!openDay} onOpenChange={(o) => !o && setOpenDay(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{openDay} — {isDkb ? "employer call rows" : "seeker rows"}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={isDkb ? "Filter by phone, company, role, status…" : "Filter by name, phone, outcome, drop reason…"}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-3"
          />
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            {dayQuery.isLoading && dayRows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Loading rows…</div>
            ) : isDkb ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Call status</TableHead>
                    <TableHead>Job status</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>New job</TableHead>
                    <TableHead className="text-right">Intent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRows.map((r, i) => {
                    const raw = r.raw ?? {};
                    return (
                      <TableRow
                        key={r.call_id || `${raw.contact_phone}-${raw.job_id}-${i}`}
                        className="cursor-pointer"
                        onClick={() => setOpenCall(r)}
                      >
                        <TableCell className="font-mono text-xs">{raw.contact_phone || r.phone}</TableCell>
                        <TableCell>{raw.company_name || "—"}</TableCell>
                        <TableCell>{raw.job_role_input || "—"}</TableCell>
                        <TableCell>{raw.city_campaign || r.city_campaign || "—"}</TableCell>
                        <TableCell>{raw.call_status || "—"}</TableCell>
                        <TableCell>{raw.job_status || "—"}</TableCell>
                        <TableCell>{raw.phases_reached || "—"}</TableCell>
                        <TableCell>{raw.new_job_posted || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{raw.intent_score || 0}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone</TableHead>
                    <TableHead>Seeker</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Engaged</TableHead>
                    <TableHead>{config.successMetric === "applications" ? "Applied" : "Interview"}</TableHead>
                    <TableHead>Drop reason</TableHead>
                    <TableHead className="text-right">Intent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRows.map((r, i) => (
                    <TableRow
                      key={r.call_id || `${r.phone}-${i}`}
                      className="cursor-pointer"
                      onClick={() => setOpenCall(r)}
                    >
                      <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                      <TableCell>{r.seeker_name}</TableCell>
                      <TableCell>{r.call_outcome}</TableCell>
                      <TableCell>{r.call_engaged ? "yes" : "no"}</TableCell>
                      <TableCell>
                        {(config.successMetric === "applications" ? r.applied_to_job : r.interview_scheduled)
                          ? "yes"
                          : "no"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.drop_reason || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{r["Intent Score"]}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>


      <CallDetailDialog
        call={openCall}
        onClose={() => setOpenCall(null)}
        program={config.id}
      />

      <LiveBatchDetailDialog
        batch={openLiveBatch}
        program={config.id}
        onClose={() => setOpenLiveBatch(null)}
      />

    </div>
  );
}


function CallDetailDialog({
  call,
  onClose,
  program,
}: {
  call: CallRow | null;
  onClose: () => void;
  program: "kkb" | "dkb";
}) {
  const fn = useServerFn(getCallDetailFn);
  const query = useQuery({
    enabled: !!call,
    queryKey: ["call-detail", program, call?.call_id],
    queryFn: () => fn({ data: { program, call_id: call!.call_id } }),
    staleTime: 5 * 60_000,
  });
  const detail = query.data?.ok ? query.data.detail : null;
  return (
    <Dialog open={!!call} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {call?.seeker_name || "Call"}{" "}
            <span className="ml-2 font-mono text-xs text-muted-foreground">{call?.call_id}</span>
          </DialogTitle>
        </DialogHeader>
        {call && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 text-muted-foreground">
              <div><span className="text-foreground">Phone:</span> {call.phone}</div>
              <div><span className="text-foreground">Outcome:</span> {call.call_outcome}</div>
              <div><span className="text-foreground">Duration:</span> {call.call_duration_seconds}s</div>
              <div><span className="text-foreground">Intent:</span> {call["Intent Score"]}</div>
            </div>
            {query.isLoading ? (
              <p className="text-muted-foreground">Loading transcript & recording…</p>
            ) : query.error ? (
              <p className="text-destructive">Failed to load call detail.</p>
            ) : !detail ? (
              <p className="text-muted-foreground">No detail found for this call.</p>
            ) : (
              <>
                <section>
                  <h4 className="mb-1 font-medium">Recording</h4>
                  {detail.call_recording_url ? (
                    <a
                      href={detail.call_recording_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand underline"
                    >
                      Open recording
                    </a>
                  ) : (
                    <p className="text-muted-foreground">—</p>
                  )}
                </section>
                <section>
                  <h4 className="mb-1 font-medium">Final summary</h4>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {detail.final_summary || "—"}
                  </p>
                </section>
                <section>
                  <h4 className="mb-1 font-medium">Transcript</h4>
                  <div className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    {detail.call_transcript || "—"}
                  </div>
                </section>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============== Live (Raya) section ==============

function LiveBatchesSection({
  program,
  onOpen,
}: {
  program: "kkb" | "dkb";
  onOpen: (b: LiveBatch) => void;
}) {
  const listFn = useServerFn(listProgramLiveBatches);
  const visible = useTabVisible();
  const query = useQuery({
    queryKey: ["live-batches", program],
    queryFn: () => listFn({ data: { program } }),
    staleTime: 20_000,
    refetchInterval: visible ? 30_000 : false,
    refetchOnWindowFocus: false,
  });

  const batches = query.data?.ok ? query.data.batches : [];
  const error = query.data && !query.data.ok ? query.data.error : null;

  return (
    <Panel
      title="Live & scheduled"
      description="Reads directly from Raya across this program's agents."
    >
      {query.isLoading && !query.data ? (
        <p className="text-sm text-muted-foreground">Loading batches…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load: {error}</p>
      ) : batches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No batches yet for this program. Launch one from the Launch wizard.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {batches.map((b) => (
            <LiveBatchCard key={b.batchId} batch={b} onOpen={() => onOpen(b)} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function LiveBatchCard({ batch, onOpen }: { batch: LiveBatch; onOpen: () => void }) {
  const isRunning = RUNNING_STATUSES.has(batch.status);
  const pct = batch.total > 0 ? Math.round((batch.dialed / batch.total) * 100) : 0;
  return (
    <button
      onClick={onOpen}
      className="group relative rounded-xl border bg-card p-4 text-left transition hover:border-brand/50 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isRunning && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            )}
            <p className="truncate text-sm font-semibold text-foreground">{batch.batchName}</p>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{batch.agentName}</p>
        </div>
        <Badge variant="outline" className={statusBadgeClass(batch.status)}>
          {isRunning ? "● Live" : batch.status || "—"}
        </Badge>
      </div>
      <div className="mt-3 space-y-1.5">
        <Progress value={pct} className="h-1.5" />
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {batch.dialed} / {batch.total || "?"} dialed · {batch.pickedUp} picked up
        </p>
      </div>
    </button>
  );
}

function LiveBatchDetailDialog({
  batch,
  onClose,
}: {
  batch: LiveBatch | null;
  onClose: () => void;
}) {
  const detailFn = useServerFn(getBatchLiveDetail);
  const stopFn = useServerFn(rayaStopBatch);
  const qc = useQueryClient();
  const visible = useTabVisible();
  const open = !!batch;
  const [confirmStop, setConfirmStop] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());

  const query = useQuery({
    enabled: open,
    queryKey: ["live-batch-detail", batch?.batchId],
    queryFn: () =>
      detailFn({
        data: {
          batchId: batch!.batchId,
          agentName: batch!.agentName,
          batchName: batch!.batchName,
        },
      }),
    refetchInterval: open && visible ? 12_000 : false,
    refetchOnWindowFocus: false,
    staleTime: 8_000,
  });

  useEffect(() => {
    if (query.dataUpdatedAt) setUpdatedAt(query.dataUpdatedAt);
  }, [query.dataUpdatedAt]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open]);

  const stopMut = useMutation({
    mutationFn: () => stopFn({ data: { batchId: batch!.batchId } }),
    onSuccess: () => {
      toast.success("Stop requested.");
      qc.invalidateQueries({ queryKey: ["live-batches"] });
      qc.invalidateQueries({ queryKey: ["live-batch-detail", batch?.batchId] });
      setConfirmStop(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to stop batch."),
  });

  const d = query.data;
  const total = d?.total ?? batch?.total ?? 0;
  const dialed = d?.dialed ?? batch?.dialed ?? 0;
  const pct = total > 0 ? Math.round((dialed / total) * 100) : 0;
  const agoSec = Math.max(0, Math.floor((now - updatedAt) / 1000));
  const isRunning = d ? RUNNING_STATUSES.has(d.status) : batch ? RUNNING_STATUSES.has(batch.status) : false;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{batch?.batchName || "Batch"}</span>
            {batch && (
              <Badge variant="outline" className={statusBadgeClass(d?.status || batch.status)}>
                {isRunning ? "● Live" : d?.status || batch.status || "—"}
              </Badge>
            )}
            <span className="ml-auto text-[11px] font-normal text-muted-foreground">
              {query.isFetching ? "Refreshing…" : `Updated ${agoSec}s ago`}
            </span>
          </DialogTitle>
        </DialogHeader>

        {!batch ? null : (
          <div className="space-y-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                <span>{dialed} / {total || "?"} dialed</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
              <StatusTile label="Pending" value={d?.pending ?? 0} accent="muted" />
              <StatusTile label="Calling" value={d?.inProgress ?? 0} accent="amber" />
              <StatusTile label="Picked up" value={d?.pickedUp ?? 0} accent="brand" />
              <StatusTile label="Completed" value={d?.completed ?? 0} accent="brand" />
              <StatusTile label="Unanswered" value={d?.unanswered ?? 0} accent="muted" />
              <StatusTile label="Failed" value={d?.failed ?? 0} accent="rose" />
            </div>

            <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-xs sm:grid-cols-2">
              <Meta label="Agent" value={d?.agentName || batch.agentName} />
              <Meta label="Schedule" value={formatSchedule(d?.schedule ?? batch.schedule)} />
              <Meta label="Concurrency" value={String(d?.concurrency ?? batch.concurrency ?? "—")} />
              <Meta label="Max retries" value={String(d?.maxRetries ?? batch.maxRetries ?? "—")} />
              <Meta label="Batch ID" value={batch.batchId} mono />
              <Meta
                label="Created"
                value={d?.createdAt ? new Date(d.createdAt).toLocaleString() : batch.createdAt ? new Date(batch.createdAt).toLocaleString() : "—"}
              />
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Recent calls</h4>
              {!d || d.recent.length === 0 ? (
                <p className="text-xs text-muted-foreground">No recent calls yet.</p>
              ) : (
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Phone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.recent.map((c, i) => (
                        <TableRow key={`${c.phone}-${i}`}>
                          <TableCell className="font-mono text-xs">{maskPhone(c.phone)}</TableCell>
                          <TableCell className="text-xs">{c.status}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {c.duration > 0 ? `${c.duration}s` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="mt-4 flex items-center justify-between gap-2 sm:justify-between">
          <p className="text-[11px] text-muted-foreground">Auto-refresh every 12s while tab is visible.</p>
          {isRunning && (
            confirmStop ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Stop this campaign?</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirmStop(false)}>Cancel</Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={stopMut.isPending}
                  onClick={() => stopMut.mutate()}
                >
                  {stopMut.isPending ? "Stopping…" : "Confirm stop"}
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => setConfirmStop(true)}>
                Stop campaign
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "brand" | "amber" | "rose" | "muted";
}) {
  const cls =
    accent === "brand"
      ? "text-brand"
      : accent === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : accent === "rose"
          ? "text-rose-600 dark:text-rose-400"
          : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`truncate text-foreground ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span>
    </div>
  );
}

