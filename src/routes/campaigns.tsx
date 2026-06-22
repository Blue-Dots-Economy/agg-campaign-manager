import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useProgram } from "@/programs/context";
import { type CallRow } from "@/programs/data";
import { useCampaignData } from "@/programs/useCampaignData";
import { byCampaignDay } from "@/programs/metrics";
import { Panel } from "@/components/Panel";
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
  const { rows } = useCampaignData(config);
  const campaigns = useMemo(() => byCampaignDay(config, rows), [config, rows]);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const detailRows: CallRow[] = useMemo(() => {
    if (!openDay) return [];
    const day = rows.filter((r) => r.campaign_day === openDay);
    if (!filter) return day;
    const q = filter.toLowerCase();
    return day.filter(
      (r) =>
        r.seeker_name.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        r.call_outcome.toLowerCase().includes(q) ||
        (r.drop_reason ?? "").toLowerCase().includes(q),
    );
  }, [rows, openDay, filter]);

  const successLabel = config.successMetric === "applications" ? "Applied" : "Interviews";

  return (
    <div className="space-y-6">
      <Panel title="Campaigns" description={`${campaigns.length} campaign days · grouped from ${rows.length} calls`}>
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
                  <TableCell className="text-right tabular-nums">{c.converted}</TableCell>
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
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{openDay} — seeker rows</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Filter by name, phone, outcome, drop reason…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-3"
          />
          <div className="max-h-[60vh] overflow-auto rounded-md border">
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
                {detailRows.map((r) => (
                  <TableRow key={r.call_id}>
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
