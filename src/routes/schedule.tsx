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

export const Route = createFileRoute("/schedule")({
  component: Schedule,
});

interface ScheduledBatch {
  id: string;
  program: "KKB" | "DKB";
  date: string;
  time: string;
  rows: number;
  region: string;
  status: "scheduled" | "running" | "done";
}

const MOCK_BATCHES: ScheduledBatch[] = [
  { id: "B-1042", program: "KKB", date: "2025-06-22", time: "10:00", rows: 1200, region: "KA", status: "done" },
  { id: "B-1043", program: "KKB", date: "2025-06-22", time: "14:00", rows: 950, region: "GZB", status: "running" },
  { id: "B-1044", program: "DKB", date: "2025-06-23", time: "11:00", rows: 600, region: "KA", status: "scheduled" },
  { id: "B-1045", program: "KKB", date: "2025-06-24", time: "10:00", rows: 1500, region: "GZB", status: "scheduled" },
  { id: "B-1046", program: "DKB", date: "2025-06-25", time: "15:30", rows: 720, region: "KA", status: "scheduled" },
];

const STATUS_STYLES: Record<ScheduledBatch["status"], string> = {
  scheduled: "bg-muted text-muted-foreground",
  running: "bg-amber-100 text-amber-800",
  done: "bg-brand-soft text-brand",
};

function Schedule() {
  return (
    <Panel title="Scheduled batches" description="Upcoming and recent voice-agent batches">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Batch</TableHead>
            <TableHead>Program</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Region</TableHead>
            <TableHead className="text-right">Rows</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MOCK_BATCHES.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-mono text-xs">{b.id}</TableCell>
              <TableCell>{b.program}</TableCell>
              <TableCell>{b.date}</TableCell>
              <TableCell>{b.time}</TableCell>
              <TableCell>{b.region}</TableCell>
              <TableCell className="text-right tabular-nums">{b.rows.toLocaleString()}</TableCell>
              <TableCell>
                <Badge variant="secondary" className={STATUS_STYLES[b.status]}>
                  {b.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
