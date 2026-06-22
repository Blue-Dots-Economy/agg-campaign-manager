import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useProgram } from "@/programs/context";
import { useProgramOverrides } from "@/lib/program-overrides";
import { rayaCreateBatch, rayaStartBatch } from "@/lib/raya.functions";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Rocket, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScheduleEditor, type ScheduleState, defaultSchedule } from "@/components/ScheduleEditor";

export const Route = createFileRoute("/launch")({
  component: Launch,
});

function detectRegion(filename: string): { region: string; language: string; city: string } {
  const f = filename.toLowerCase();
  if (f.includes("ka") || f.includes("kannada") || f.includes("hubli")) {
    return { region: "KA", language: "Kannada", city: "Hubli-Dharwad" };
  }
  return { region: "GZB", language: "Hindi", city: "Ghaziabad" };
}

interface ParsedCsv {
  headers: string[];
  rows: string[][];
  total: number;
  all: string[][];
}

function parseCsv(text: string): ParsedCsv {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [], total: 0, all: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const all = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
  return { headers, rows: all.slice(0, 20), total: all.length, all };
}

function pickColumn(headers: string[], candidates: string[]): number {
  const lc = headers.map((h) => h.toLowerCase());
  for (const c of candidates) {
    const i = lc.indexOf(c.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function buildContacts(parsed: ParsedCsv) {
  const nameIdx = pickColumn(parsed.headers, ["contact_name", "name", "seeker_name", "candidate_name"]);
  const phoneIdx = pickColumn(parsed.headers, ["contact_phone", "phone", "mobile", "phone_number"]);
  const ccIdx = pickColumn(parsed.headers, ["country_code", "cc"]);
  if (phoneIdx < 0) throw new Error("CSV must include a phone column (phone / contact_phone / mobile).");

  return parsed.all.map((row, i) => {
    const contact: Record<string, any> = {
      contact_name: nameIdx >= 0 ? row[nameIdx] || `Contact ${i + 1}` : `Contact ${i + 1}`,
      contact_phone: (row[phoneIdx] ?? "").replace(/[^\d]/g, ""),
      country_code: ccIdx >= 0 && row[ccIdx] ? row[ccIdx].replace(/[^\d]/g, "") || "91" : "91",
    };
    parsed.headers.forEach((h, j) => {
      if (j === nameIdx || j === phoneIdx || j === ccIdx) return;
      if (!h) return;
      contact[h] = row[j] ?? "";
    });
    return contact;
  });
}

function Launch() {
  const { config, programId } = useProgram();
  const overrides = useProgramOverrides(programId);
  const agentId = overrides.rayaAgentId || config.rayaAgentId;

  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [detected, setDetected] = useState<{ region: string; language: string; city: string } | null>(null);
  const [batchName, setBatchName] = useState("");
  const [schedule, setSchedule] = useState<ScheduleState>(defaultSchedule);
  const [maxRetries, setMaxRetries] = useState(2);
  const [createdBatchId, setCreatedBatchId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startStatus, setStartStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const createBatchFn = useServerFn(rayaCreateBatch);
  const startBatchFn = useServerFn(rayaStartBatch);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setCreatedBatchId(null);
    setStartStatus(null);
    const region = detectRegion(f.name);
    setDetected(region);
    setBatchName(`${f.name.replace(/\.csv$/i, "")} · ${new Date().toISOString().slice(0, 10)}`);
    f.text().then((t) => setParsed(parseCsv(t)));
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const create = async () => {
    if (!parsed) return;
    if (!agentId) {
      toast.error("Set the Raya agent id for this program in Settings first.");
      return;
    }
    setCreating(true);
    try {
      const contacts = buildContacts(parsed) as any;
      const res: any = await createBatchFn({
        data: { agentId, batchName, contacts },
      });
      const id = res?.id ?? res?.batch_id ?? res?.batch?.id ?? res?.data?.id;
      if (!id) throw new Error("Batch created but no id returned.");
      setCreatedBatchId(String(id));
      toast.success(`Batch created · ${id}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create batch");
    } finally {
      setCreating(false);
    }
  };

  const start = async () => {
    if (!createdBatchId) return;
    setStarting(true);
    try {
      const res: any = await startBatchFn({
        data: {
          batchId: createdBatchId,
          schedule: {
            timezone: schedule.timezone,
            start_time: schedule.startTime,
            end_time: schedule.endTime,
            days: schedule.days,
          },
          maxRetries,
        },
      });
      const status = res?.status ?? res?.batch?.status ?? "started";
      setStartStatus(String(status));
      toast.success(`Batch started · ${status}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start batch");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Upload CSV" description="Drop a seeker list to begin">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-12 cursor-pointer transition-colors ${
              drag ? "border-brand bg-brand-soft" : "border-border bg-muted/40"
            }`}
          >
            <div className="h-10 w-10 rounded-full bg-brand-soft flex items-center justify-center text-brand">
              <Upload className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium">Drop CSV here, or click to browse</p>
            <p className="text-xs text-muted-foreground">
              Required columns: phone (or contact_phone). Optional: contact_name, country_code, and any extras passed as agent_args.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              hidden
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          {file && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <InfoTile icon={<FileText className="h-4 w-4" />} label="File" value={file.name} />
              <InfoTile label="Rows" value={parsed?.total?.toLocaleString() ?? "—"} />
              <InfoTile
                label="Detected region"
                value={detected ? `${detected.region} · ${detected.language}` : "—"}
                hint={detected?.city}
              />
            </div>
          )}

          {parsed && parsed.headers.length > 0 && (
            <div className="mt-5">
              <p className="text-xs text-muted-foreground mb-2">Preview · first 20 rows</p>
              <div className="max-h-72 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {parsed.headers.map((h) => (
                        <TableHead key={h} className="whitespace-nowrap text-xs">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.map((r, i) => (
                      <TableRow key={i}>
                        {r.map((c, j) => (
                          <TableCell key={j} className="text-xs whitespace-nowrap">
                            {c}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Launch flow" description={`Steps for ${config.label}`}>
          <ol className="space-y-3">
            {config.launchSteps.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <div className="h-6 w-6 shrink-0 rounded-full bg-brand-soft text-brand text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 border-t pt-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Agent</span>
              <span className="font-mono">{agentId || <em className="text-destructive not-italic">not set</em>}</span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="1 · Create batch" description="Posts contacts to Raya">
          <div className="space-y-3">
            <div>
              <Label htmlFor="batchName" className="text-xs">Batch name</Label>
              <Input id="batchName" value={batchName} onChange={(e) => setBatchName(e.target.value)} className="mt-1" />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Contacts will be built from:</span>
              <Badge variant="secondary" className="bg-muted">name</Badge>
              <Badge variant="secondary" className="bg-muted">phone</Badge>
              <Badge variant="secondary" className="bg-muted">country_code</Badge>
              <span>+ extras → agent_args</span>
            </div>
            <Button
              onClick={create}
              disabled={!parsed || creating}
              className="w-full bg-brand text-brand-foreground hover:bg-brand/90 gap-1.5"
            >
              {creating ? "Creating…" : <><Rocket className="h-4 w-4" /> Create batch</>}
            </Button>
            {createdBatchId && (
              <div className="rounded-md bg-brand-soft text-brand px-3 py-2 text-xs flex items-center gap-2">
                <Check className="h-3.5 w-3.5" /> Batch id: <span className="font-mono">{createdBatchId}</span>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="2 · Schedule & start" description="Recurring call window">
          <ScheduleEditor value={schedule} onChange={setSchedule} />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="retries" className="text-xs">Max retries</Label>
              <Input
                id="retries"
                type="number"
                min={0}
                max={10}
                value={maxRetries}
                onChange={(e) => setMaxRetries(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
          </div>
          <Button
            onClick={start}
            disabled={!createdBatchId || starting}
            className="mt-4 w-full bg-brand text-brand-foreground hover:bg-brand/90 gap-1.5"
          >
            {starting ? "Starting…" : "Start batch"}
          </Button>
          {startStatus && (
            <div className="mt-2 rounded-md bg-brand-soft text-brand px-3 py-2 text-xs flex items-center gap-2">
              <Check className="h-3.5 w-3.5" /> Status: {startStatus}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Note: Raya rate-limits single calls to 1 per 20s by default.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function InfoTile({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium truncate mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
