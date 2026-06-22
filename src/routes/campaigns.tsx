import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useProgram } from "@/programs/context";
import { type CallRow } from "@/programs/data";
import { useProgramAggregates } from "@/programs/useProgramAggregates";
import { Panel } from "@/components/Panel";
import { NoDataState, LoadingState } from "@/components/EmptyState";
import { getCallDetailFn } from "@/lib/connections.functions";
import { fetchCampaignDayRowsFn } from "@/lib/snapshot.functions";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/campaigns")({
  component: Campaigns,
});

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

  if (query.isLoading && !data) return <LoadingState />;
  if (!data || data.source === "empty" || data.totalRows === 0) return <NoDataState />;

  const campaigns = data.campaigns;

  return (
    <div className="space-y-6">
      <Panel title="Campaigns" description={`${campaigns.length} campaign days · ${data.totalRows} calls in snapshot`}>
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
              {campaigns.map((c) => (
                <TableRow
                  key={c.day}
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
