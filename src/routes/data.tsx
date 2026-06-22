import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/data")({
  component: DataUploads,
});

interface UploadRow {
  date: string;
  program: string;
  file: string;
  rows: number;
  status: "appended" | "queued" | "failed";
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

function DataUploads() {
  return (
    <Panel title="Data & uploads" description="History of CSV uploads appended to the master sheets">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Program</TableHead>
            <TableHead>File</TableHead>
            <TableHead className="text-right">Rows added</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_UPLOADS.map((u, i) => (
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
