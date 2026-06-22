import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getLaunchLog, type LaunchLogEntry } from "@/lib/launch-log";

export const Route = createFileRoute("/data")({
  component: DataUploads,
});

interface UploadRow {
  date: string;
  program: string;
  file: string;
  rows: number;
  status: "appended" | "queued" | "failed";
  batchId?: string;
}

const STATUS: Record<UploadRow["status"], string> = {
  appended: "bg-brand-soft text-brand",
  queued: "bg-muted text-muted-foreground",
  failed: "bg-red-100 text-red-700",
};

function fromLog(e: LaunchLogEntry): UploadRow {
  return {
    date: new Date(e.date).toISOString().replace("T", " ").slice(0, 16),
    program: e.program.toUpperCase(),
    file: e.file,
    rows: e.rows,
    status: e.status,
    batchId: e.batchId,
  };
}

function DataUploads() {
  const [log, setLog] = useState<LaunchLogEntry[]>([]);
  useEffect(() => {
    const sync = () => setLog(getLaunchLog());
    sync();
    window.addEventListener("rozgar:launchLog", sync);
    return () => window.removeEventListener("rozgar:launchLog", sync);
  }, []);
  const all: UploadRow[] = log.map(fromLog);
  return (
    <Panel title="Data & uploads" description="History of CSV uploads launched as batches">
      {all.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No uploads yet — launch a campaign to see history here.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>File</TableHead>
              <TableHead className="text-right">Rows added</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Batch</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {all.map((u, i) => (
              <TableRow key={i}>
                <TableCell className="text-sm text-muted-foreground">{u.date}</TableCell>
                <TableCell>{u.program}</TableCell>
                <TableCell className="font-mono text-xs">{u.file}</TableCell>
                <TableCell className="text-right tabular-nums">{u.rows.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={STATUS[u.status]}>
                    {u.status}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">{u.batchId ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
