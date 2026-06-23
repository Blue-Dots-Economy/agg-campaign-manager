import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useProgram } from "@/programs/context";
import { useProgramOverrides } from "@/lib/program-overrides";
import { rayaListBatches, rayaStopBatch, rayaUpdateBatch } from "@/lib/raya.functions";
import { Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScheduleEditor, type ScheduleState, defaultSchedule } from "@/components/ScheduleEditor";
import { toast } from "sonner";
import { RefreshCw, StopCircle, Save, Gauge } from "lucide-react";
import { useConcurrencyUsage, useRefreshConcurrency } from "@/hooks/useConcurrencyUsage";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/schedule")({
  component: Schedule,
});

interface BatchRow {
  id: string;
  name?: string;
  status?: string;
  created_at?: string;
  schedule?: { timezone?: string; start_time?: string; end_time?: string; days?: number[] };
}

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground",
  running: "bg-amber-100 text-amber-800",
  active: "bg-amber-100 text-amber-800",
  done: "bg-brand-soft text-brand",
  completed: "bg-brand-soft text-brand",
  stopped: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
};

function normalize(item: any): BatchRow {
  return {
    id: String(item.id ?? item.batch_id ?? ""),
    name: item.name ?? item.batch_name,
    status: item.status,
    created_at: item.created_at ?? item.createdAt,
    schedule: item.schedule,
  };
}

function Schedule() {
  const { config, programId } = useProgram();
  const overrides = useProgramOverrides(programId);
  const agentId = overrides.rayaAgentId || config.rayaAgentId;

  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BatchRow | null>(null);
  const [schedule, setSchedule] = useState<ScheduleState>(defaultSchedule);
  const [maxRetries, setMaxRetries] = useState(2);
  const [concurrency, setConcurrency] = useState(5);

  const listFn = useServerFn(rayaListBatches);
  const stopFn = useServerFn(rayaStopBatch);
  const updateFn = useServerFn(rayaUpdateBatch);
  const usage = useConcurrencyUsage();
  const refreshUsage = useRefreshConcurrency();

  const load = async () => {
    if (!agentId) {
      setError("Set the Raya agent id for this program in Settings to list batches.");
      setBatches([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res: any = await listFn({ data: { agentId, pageSize: 50 } });
      const items: any[] = res?.items ?? res?.data ?? res?.batches ?? (Array.isArray(res) ? res : []);
      setBatches(items.map(normalize));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load batches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const openEdit = (b: BatchRow) => {
    setEditing(b);
    setSchedule({
      timezone: b.schedule?.timezone || defaultSchedule.timezone,
      startTime: b.schedule?.start_time || defaultSchedule.startTime,
      endTime: b.schedule?.end_time || defaultSchedule.endTime,
      days: b.schedule?.days?.length ? b.schedule!.days! : defaultSchedule.days,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updateFn({
        data: {
          batchId: editing.id,
          schedule: {
            timezone: schedule.timezone,
            start_time: schedule.startTime,
            end_time: schedule.endTime,
            days: schedule.days,
          },
          maxRetries,
          concurrency,
        },
      });
      toast.success("Batch updated");
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update batch");
    }
  };

  const stop = async (id: string) => {
    try {
      await stopFn({ data: { batchId: id } });
      toast.success("Batch stopped");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to stop batch");
    }
  };

  const fmtDays = (d?: number[]) =>
    d && d.length
      ? d
          .slice()
          .sort()
          .map((n) => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][n] ?? `${n}`)
          .join(" ")
      : "—";

  return (
    <div className="space-y-6">
      <Panel
        title="Scheduled batches"
        description={agentId ? `Agent ${agentId} · ${batches.length} batches` : "Set the Raya agent id in Settings"}
        action={
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      >
        {error && (
          <div className="mb-3 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-xs">{error}</div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Window</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    No batches found.
                  </TableCell>
                </TableRow>
              )}
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.id}</TableCell>
                  <TableCell className="text-sm">{b.name ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {b.schedule?.start_time && b.schedule?.end_time
                      ? `${b.schedule.start_time}–${b.schedule.end_time}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{fmtDays(b.schedule?.days)}</TableCell>
                  <TableCell className="text-xs">{b.schedule?.timezone ?? "—"}</TableCell>
                  <TableCell>
                    {b.status ? (
                      <Badge variant="secondary" className={STATUS_STYLES[b.status] ?? "bg-muted"}>
                        {b.status}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => stop(b.id)}
                      >
                        <StopCircle className="h-3.5 w-3.5 mr-1" /> Stop
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      {editing && (
        <Panel title={`Edit batch · ${editing.id}`} description="Update the recurring call window">
          <ScheduleEditor value={schedule} onChange={setSchedule} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Max retries</Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Concurrency</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={saveEdit} className="bg-brand text-brand-foreground hover:bg-brand/90 gap-1.5">
              <Save className="h-4 w-4" /> Save changes
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
