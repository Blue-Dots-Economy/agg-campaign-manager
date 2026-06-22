import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useRef } from "react";
import { useProgram } from "@/programs/context";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/launch")({
  component: Launch,
});

function detectRegion(filename: string): { region: string; language: string; city: string } {
  const f = filename.toLowerCase();
  if (f.includes("ka") || f.includes("kannada") || f.includes("hubli")) {
    return { region: "KA", language: "Kannada", city: "Hubli-Dharwad" };
  }
  if (f.includes("gzb") || f.includes("hindi") || f.includes("ghaziabad")) {
    return { region: "GZB", language: "Hindi", city: "Ghaziabad" };
  }
  return { region: "GZB", language: "Hindi", city: "Ghaziabad" };
}

function parseCsvPreview(text: string, max = 20) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [], total: 0 };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1, max + 1).map((l) => l.split(","));
  return { headers, rows, total: lines.length - 1 };
}

function Launch() {
  const { config } = useProgram();
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][]; total: number } | null>(null);
  const [detected, setDetected] = useState<{ region: string; language: string; city: string } | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setDetected(detectRegion(f.name));
    f.text().then((t) => setPreview(parseCsvPreview(t)));
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const launch = () => {
    toast.message("Raya integration pending — Phase 2", {
      description: `Would create & schedule a ${preview?.total ?? 0}-row batch for ${config.label}.`,
    });
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
              Filename hint: include "KA"/"Kannada"/"Hubli" or "GZB"/"Hindi"/"Ghaziabad"
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
              <InfoTile label="Rows" value={preview?.total?.toLocaleString() ?? "—"} />
              <InfoTile
                label="Detected region"
                value={detected ? `${detected.region} · ${detected.language}` : "—"}
                hint={detected?.city}
              />
            </div>
          )}

          {preview && preview.headers.length > 0 && (
            <div className="mt-5">
              <p className="text-xs text-muted-foreground mb-2">Preview · first 20 rows</p>
              <div className="max-h-72 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {preview.headers.map((h) => (
                        <TableHead key={h} className="whitespace-nowrap text-xs">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((r, i) => (
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

          <div className="mt-5 space-y-3 border-t pt-4">
            <div>
              <Label htmlFor="schedule" className="text-xs">
                Schedule call window
              </Label>
              <Input
                id="schedule"
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="mt-1"
              />
            </div>
            {detected && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Region</span>
                <Badge variant="secondary" className="bg-brand-soft text-brand">
                  {detected.region} · {detected.language}
                </Badge>
              </div>
            )}
            <Button
              onClick={launch}
              disabled={!file}
              className="w-full bg-brand text-brand-foreground hover:bg-brand/90 gap-1.5"
            >
              <Check className="h-4 w-4" /> Create & schedule batch
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Phase 2 — Raya integration pending
            </p>
          </div>
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
