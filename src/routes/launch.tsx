import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useProgram } from "@/programs/context";
import { useProgramOverrides } from "@/lib/program-overrides";
import {
  rayaCreateBatch,
  rayaStartBatch,
  validateContacts,
} from "@/lib/raya.functions";
import { listProgramAgents } from "@/lib/agents.functions";
import { useConcurrencyUsage, useRefreshConcurrency } from "@/hooks/useConcurrencyUsage";
import { Link } from "@tanstack/react-router";
import { registry, type ProgramId } from "@/programs/registry";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileText,
  Rocket,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ScheduleEditor, type ScheduleState, makeDefaultSchedule } from "@/components/ScheduleEditor";
import { appendLaunchLog } from "@/lib/launch-log";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/launch")({
  component: LaunchWizard,
});

const STEPS = [
  "Program",
  "Agent",
  "Upload & validate",
  "Schedule",
  "Concurrency",
  "Review",
  "Launch",
] as const;

interface ValidationReport {
  total: number;
  valid: number;
  invalid: number;
  missingCols: string[];
  problems: { row: number; reason: string; phone?: string; name?: string }[];
  validRows: { name: string; phone: string; cc: string; extras: Record<string, string>; rowIndex: number }[];
}

interface ParsedCsv { headers: string[]; rows: string[][] }

function parseCsv(text: string): ParsedCsv {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
  return { headers, rows };
}

function detectRegion(filename: string): { region: string; language: string; city: string } {
  const f = filename.toLowerCase();
  if (f.includes("ka") || f.includes("kannada") || f.includes("hubli")) {
    return { region: "KA", language: "Kannada", city: "Hubli-Dharwad" };
  }
  return { region: "GZB", language: "Hindi", city: "Ghaziabad" };
}

function LaunchWizard() {
  const { programId: ctxProgram, config: ctxConfig, setProgramId } = useProgram();
  const [step, setStep] = useState(0);
  const [program, setProgram] = useState<ProgramId>(ctxProgram);
  const config = registry[program];
  const overrides = useProgramOverrides(program);
  const defaultAgentId = overrides.rayaAgentId || config.rayaAgentId || "";

  const [agentId, setAgentId] = useState<string>(defaultAgentId);
  const [agentName, setAgentName] = useState<string>("");

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [region, setRegion] = useState<string>("");
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [validating, setValidating] = useState(false);
  const [proceedInvalid, setProceedInvalid] = useState(false);

  const [schedule, setSchedule] = useState<ScheduleState>(() => makeDefaultSchedule());
  const [concurrency, setConcurrency] = useState(5);
  const [maxRetries, setMaxRetries] = useState(2);
  const [retryAfterHrs, setRetryAfterHrs] = useState(24);

  const [batchName, setBatchName] = useState("");
  const [launching, setLaunching] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [startStatus, setStartStatus] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const listAgentsFn = useServerFn(listProgramAgents);
  const validateFn = useServerFn(validateContacts);
  const createBatchFn = useServerFn(rayaCreateBatch);
  const startBatchFn = useServerFn(rayaStartBatch);
  const usage = useConcurrencyUsage();
  const refreshUsage = useRefreshConcurrency();
  const available = usage.data?.available ?? Infinity;
  const cap = usage.data?.cap ?? 20;


  // Sync chosen program back to global context so the rest of the dashboard follows.
  useEffect(() => { if (program !== ctxProgram) setProgramId(program); }, [program, ctxProgram, setProgramId]);

  const agentsQuery = useQuery({
    queryKey: ["program-agents", program],
    queryFn: () => listAgentsFn({ data: { program } }),
    enabled: step >= 1,
    retry: false,
  });

  useEffect(() => {
    if (!agentName && agentsQuery.data && agentId) {
      const found = agentsQuery.data.find((a) => a.agent_id === agentId);
      if (found) setAgentName(found.name);
    }
  }, [agentsQuery.data, agentId, agentName]);

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const canNext = useMemo(() => {
    if (step === 0) return !!program;
    if (step === 1) return !!agentId;
    if (step === 2) {
      if (!report) return false;
      if (report.missingCols.length > 0) return false;
      if (report.invalid === 0) return true;
      return proceedInvalid;
    }
    if (step === 3) return schedule.startTime < schedule.endTime && schedule.days.length > 0;
    if (step === 4) return concurrency > 0 && maxRetries >= 0 && retryAfterHrs > 0;
    return true;
  }, [step, program, agentId, report, proceedInvalid, schedule, concurrency, maxRetries, retryAfterHrs]);

  const onFile = useCallback(async (f: File) => {
    setFile(f);
    setReport(null);
    setProceedInvalid(false);
    setRegion(detectRegion(f.name).region);
    setBatchName(`${f.name.replace(/\.csv$/i, "")} · ${new Date().toISOString().slice(0, 10)}`);
    const text = await f.text();
    const p = parseCsv(text);
    setParsed(p);
    setValidating(true);
    try {
      const res = await validateFn({ data: { headers: p.headers, rows: p.rows } });
      setReport(res as ValidationReport);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }, [validateFn]);

  const launch = async () => {
    if (!report) return;
    setLaunching(true); setLaunchError(null);
    try {
      const contacts = report.validRows.map((r) => ({
        contact_name: r.name,
        contact_phone: r.phone,
        country_code: r.cc,
        ...r.extras,
        _region: region,
      }));
      const created = await createBatchFn({ data: { agentId, batchName, contacts } }) as
        | { ok: true; batchId: string; contactsInserted?: number; totalRows?: number; message?: string }
        | { ok: false; batchId: null; validation: { message: string; totalRows?: number; validRows?: number; invalidRows?: number; errors: Array<{ row?: number; field?: string; message?: string; value?: any }> } };

      if (!created.ok) {
        const v = created.validation;
        const sample = (v.errors ?? []).slice(0, 5)
          .map((er) => `row ${er.row ?? "?"}${er.field ? ` · ${er.field}` : ""}${er.message ? `: ${er.message}` : ""}`)
          .join("\n");
        const more = (v.errors?.length ?? 0) > 5 ? `\n…and ${v.errors!.length - 5} more` : "";
        throw new Error(
          `${v.message}${typeof v.invalidRows === "number" ? ` (${v.invalidRows} invalid of ${v.totalRows ?? "?"})` : ""}${sample ? `\n${sample}${more}` : ""}`,
        );
      }

      const id = created.batchId;
      setBatchId(id);
      const started: any = await startBatchFn({
        data: {
          batchId: id,
          schedule: {
            timezone: schedule.timezone,
            start_time: schedule.startTime,
            end_time: schedule.endTime,
            days: schedule.days,
          },
          maxRetries,
          retryAfterHrs,
          concurrency,
        },
      });
      const status = started?.status ?? started?.batch?.status ?? "started";
      setStartStatus(String(status));
      appendLaunchLog({
        date: new Date().toISOString(),
        program,
        file: file?.name ?? batchName,
        rows: contacts.length,
        status: "appended",
        batchId: id,
      });
      toast.success(`Batch launched · ${id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Launch failed";
      setLaunchError(msg);
      toast.error(msg.split("\n")[0]);
      if (file) {
        appendLaunchLog({
          date: new Date().toISOString(),
          program,
          file: file.name,
          rows: report.valid,
          status: "failed",
        });
      }
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 0 && (
        <Panel title="Step 1 · Program" description="Pick which program this batch belongs to">
          <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
            {(["kkb", "dkb"] as ProgramId[]).map((p) => (
              <button
                key={p}
                onClick={() => setProgram(p)}
                className={cn(
                  "rounded-xl border-2 p-5 text-left transition-colors",
                  program === p ? "border-brand bg-brand-soft" : "border-border bg-card hover:bg-muted/40",
                )}
              >
                <div className="text-lg font-semibold">{registry[p].label}</div>
                <div className="text-xs text-muted-foreground mt-1">{registry[p].subtitle}</div>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {step === 1 && (
        <Panel title="Step 2 · Agent" description={`Choose which saved ${program.toUpperCase()} agent will place the calls`}>
          {agentsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading agents…</div>
          )}
          {agentsQuery.error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {(agentsQuery.error as Error).message}
            </div>
          )}
          {agentsQuery.data && agentsQuery.data.length === 0 && (
            <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
              No agents saved for {program.toUpperCase()}.{" "}
              <Link to="/agents" className="text-brand underline">Add one in the Agents section</Link>.
            </div>
          )}
          {agentsQuery.data && agentsQuery.data.length > 0 && (
            <div className="space-y-2 max-w-xl">
              <Label>Raya agent</Label>
              <Select
                value={agentId}
                onValueChange={(v) => {
                  setAgentId(v);
                  setAgentName(agentsQuery.data?.find((a) => a.agent_id === v)?.name ?? "");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select an agent" /></SelectTrigger>
                <SelectContent>
                  {agentsQuery.data.map((a) => (
                    <SelectItem key={a.id} value={a.agent_id}>
                      <div className="flex flex-col">
                        <span>{a.name} — <span className="font-mono text-[10px] opacity-60">{a.agent_id}</span></span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Manage agents in the <Link to="/agents" className="text-brand underline">Agents</Link> section.
              </p>
            </div>
          )}
        </Panel>
      )}

      {step === 2 && (
        <UploadStep
          file={file}
          parsed={parsed}
          report={report}
          validating={validating}
          region={region}
          setRegion={setRegion}
          proceedInvalid={proceedInvalid}
          setProceedInvalid={setProceedInvalid}
          onFile={onFile}
          onReset={() => { setFile(null); setParsed(null); setReport(null); setProceedInvalid(false); }}
        />
      )}

      {step === 3 && (
        <Panel title="Step 4 · Schedule" description="Days, time window, and timezone for the call window">
          <div className="max-w-xl"><ScheduleEditor value={schedule} onChange={setSchedule} /></div>
        </Panel>
      )}

      {step === 4 && (
        <Panel title="Step 5 · Concurrency & retries" description="How aggressively Raya should dial">
          <div className="mb-4 max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              Raya rate limit: <strong>1 call per 20 seconds</strong> by default. Keep concurrency low or launches will be throttled (HTTP 429).
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 max-w-2xl">
            <NumberField label="Concurrency" value={concurrency} onChange={setConcurrency} min={1} max={100} />
            <NumberField label="Max retries" value={maxRetries} onChange={setMaxRetries} min={0} max={10} />
            <NumberField label="Retry after (hrs)" value={retryAfterHrs} onChange={setRetryAfterHrs} min={1} max={168} />
          </div>
        </Panel>
      )}

      {step === 5 && (
        <Panel title="Step 6 · Review" description="Confirm everything before sending to Raya">
          <div className="grid gap-3 sm:grid-cols-2 text-sm max-w-3xl">
            <Field label="Program" value={config.label} />
            <Field label="Agent" value={agentName || agentId} mono />
            <Field label="Agent id" value={agentId} mono />
            <Field label="Batch name" value={batchName} />
            <Field label="File" value={file?.name ?? "—"} />
            <Field label="Region" value={region} />
            <Field label="Valid contacts" value={`${report?.valid ?? 0} of ${report?.total ?? 0}`} />
            <Field label="Will skip" value={String(report?.invalid ?? 0)} />
            <Field label="Days" value={dayLabels(schedule.days)} />
            <Field label="Time window" value={`${schedule.startTime}–${schedule.endTime}`} />
            <Field label="Timezone" value={schedule.timezone} />
            <Field label="Concurrency" value={String(concurrency)} />
            <Field label="Max retries" value={String(maxRetries)} />
            <Field label="Retry after" value={`${retryAfterHrs} hrs`} />
          </div>
          <div className="mt-6">
            <Label htmlFor="bn" className="text-xs">Edit batch name</Label>
            <Input id="bn" value={batchName} onChange={(e) => setBatchName(e.target.value)} className="mt-1 max-w-md" />
          </div>
        </Panel>
      )}

      {step === 6 && (
        <Panel title="Step 7 · Launch" description="Create the batch in Raya and start the schedule">
          <div className="space-y-4 max-w-xl">
            {!batchId && !launching && (
              <Button
                onClick={launch}
                className="bg-brand text-brand-foreground hover:bg-brand/90 gap-1.5"
                size="lg"
              >
                <Rocket className="h-4 w-4" /> Launch campaign
              </Button>
            )}
            {launching && (
              <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Creating batch and starting schedule…</div>
            )}
            {batchId && (
              <div className="rounded-md bg-brand-soft text-brand px-3 py-2 text-sm flex items-center gap-2">
                <Check className="h-4 w-4" /> Batch created · <span className="font-mono">{batchId}</span>
              </div>
            )}
            {startStatus && (
              <div className="rounded-md bg-brand-soft text-brand px-3 py-2 text-sm flex items-center gap-2">
                <Check className="h-4 w-4" /> Status: {startStatus}
              </div>
            )}
            {launchError && (
              <div className="rounded-md bg-red-50 text-red-700 px-3 py-2 text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="whitespace-pre-line">{launchError}</div>
              </div>
            )}
          </div>
        </Panel>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={back} disabled={step === 0 || launching}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next} disabled={!canNext} className="bg-brand text-brand-foreground hover:bg-brand/90">
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" onClick={() => { setStep(0); setBatchId(null); setStartStatus(null); setFile(null); setParsed(null); setReport(null); }}>
            Start over
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={label} className="flex items-center gap-2 shrink-0">
            <div className={cn(
              "h-7 w-7 rounded-full text-xs font-semibold flex items-center justify-center border-2",
              done ? "bg-brand border-brand text-brand-foreground" :
              active ? "border-brand text-brand" : "border-border text-muted-foreground",
            )}>
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn("text-xs whitespace-nowrap", active ? "font-medium text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function UploadStep({
  file, parsed, report, validating, region, setRegion, proceedInvalid, setProceedInvalid, onFile, onReset,
}: {
  file: File | null;
  parsed: ParsedCsv | null;
  report: ValidationReport | null;
  validating: boolean;
  region: string;
  setRegion: (r: string) => void;
  proceedInvalid: boolean;
  setProceedInvalid: (v: boolean) => void;
  onFile: (f: File) => void;
  onReset: () => void;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Panel title="Step 3 · Upload & validate" description="Drop a CSV — we validate before any Raya call is made">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-10 cursor-pointer transition-colors",
          drag ? "border-brand bg-brand-soft" : "border-border bg-muted/40",
        )}
      >
        <div className="h-10 w-10 rounded-full bg-brand-soft flex items-center justify-center text-brand">
          <Upload className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium">Drop CSV here, or click to browse</p>
        <p className="text-xs text-muted-foreground">Required: contact_name, contact_phone. Optional: country_code (default 91).</p>
        <input ref={inputRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </div>

      {file && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> File
              </div>
              <div className="text-sm font-medium truncate" title={file.name}>{file.name}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-red-600"
              onClick={(e) => { e.stopPropagation(); onReset(); if (inputRef.current) inputRef.current.value = ""; }}
              title="Remove file"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <InfoTile label="Rows" value={parsed?.rows.length.toLocaleString() ?? "—"} />
          <div className="rounded-lg border bg-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Detected region</div>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="KA">KA · Kannada · Hubli</SelectItem>
                <SelectItem value="GZB">GZB · Hindi · Ghaziabad</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {validating && (
        <div className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Validating…</div>
      )}

      {report && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-brand-soft text-brand hover:bg-brand-soft">{report.valid} valid</Badge>
            <Badge variant="secondary">{report.total} total</Badge>
            {report.invalid > 0 && <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{report.invalid} problems</Badge>}
          </div>
          {report.missingCols.length > 0 && (
            <div className="rounded-md bg-red-50 text-red-700 px-3 py-2 text-sm">
              Missing required column{report.missingCols.length === 1 ? "" : "s"}: <span className="font-mono">{report.missingCols.join(", ")}</span>
            </div>
          )}
          {report.problems.length > 0 && (
            <div className="rounded-md border max-h-56 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.problems.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{p.row}</TableCell>
                      <TableCell className="text-xs">{p.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {report.invalid > 0 && report.missingCols.length === 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={proceedInvalid} onChange={(e) => setProceedInvalid(e.target.checked)} />
              Proceed with {report.valid} valid rows only (skip {report.invalid} problem rows)
            </label>
          )}
        </div>
      )}

      {parsed && parsed.headers.length > 0 && (
        <div className="mt-5">
          <p className="text-xs text-muted-foreground mb-2">Preview · first 20 rows</p>
          <div className="max-h-72 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>{parsed.headers.map((h) => <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {parsed.rows.slice(0, 20).map((r, i) => (
                  <TableRow key={i}>{r.map((c, j) => <TableCell key={j} className="text-xs whitespace-nowrap">{c}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Panel>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="mt-1" />
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm mt-0.5 break-all", mono && "font-mono")}>{value || "—"}</div>
    </div>
  );
}

function InfoTile({ icon, label, value, hint }: { icon?: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
        {icon}{label}
      </div>
      <div className="text-sm font-medium truncate">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function dayLabels(days: number[]) {
  return days.slice().sort().map((d) => DAY_NAMES[d]).join(", ") || "—";
}
