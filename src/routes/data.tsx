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

const MOCK_UPLOADS: UploadRow[] = [
  { date: "2025-06-21 14:32", program: "KKB", file: "seekers_GZB_day8.csv", rows: 1240, status: "appended" },
  { date: "2025-06-21 10:11", program: "KKB", file: "seekers_KA_day8.csv", rows: 980, status: "appended" },
  { date: "2025-06-20 16:02", program: "DKB", file: "candidates_KA_batch3.csv", rows: 620, status: "appended" },
  { date: "2025-06-20 09:48", program: "KKB", file: "seekers_GZB_day7.csv", rows: 1100, status: "appended" },
  { date: "2025-06-19 18:20", program: "DKB", file: "candidates_GZB_pilot.csv", rows: 410, status: "queued" },
];

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
  const all: UploadRow[] = [...log.map(fromLog), ...MOCK_UPLOADS];
  return (
    <Panel title="Data & uploads" description="History of CSV uploads launched as batches">
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
    </Panel>
  );
}
