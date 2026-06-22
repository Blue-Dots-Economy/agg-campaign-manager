import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useProgram } from "@/programs/context";
import { Panel } from "@/components/Panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

function Settings() {
  const { config } = useProgram();
  const [sheetUrl, setSheetUrl] = useState(config.sheetCsvUrl);
  const [agent, setAgent] = useState(config.rayaAgentId);
  const [from, setFrom] = useState(config.fromNumber);

  return (
    <div className="space-y-6">
      <Panel title={`${config.label} settings`} description="Per-program configuration · read from registry">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sheet" className="text-xs">Connected sheet (CSV URL)</Label>
            <Input id="sheet" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/…/pub?output=csv" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="agent" className="text-xs">Raya agent id</Label>
            <Input id="agent" value={agent} onChange={(e) => setAgent(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="from" className="text-xs">From-number</Label>
            <Input id="from" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" />
          </div>
          <div className="flex items-end">
            <Button
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={() => toast.success("Settings saved (in-session)")}
            >
              Save changes
            </Button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="KPI definitions" description="Drives the Overview cards">
          <ul className="divide-y">
            {config.kpis.map((k) => (
              <li key={k.key} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium">{k.label}</div>
                  <div className="text-xs text-muted-foreground font-mono">{k.key}</div>
                </div>
                <Badge variant="secondary" className="bg-brand-soft text-brand">
                  {k.format}
                </Badge>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Drop-reason buckets" description="Per-program taxonomy">
          <div className="flex flex-wrap gap-2">
            {config.dropReasons.map((r) => (
              <Badge key={r} variant="secondary" className="bg-muted text-foreground font-mono">
                {r}
              </Badge>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Column schema" description={`${config.columns.length} columns expected in the ${config.label} master sheet`}>
        <div className="flex flex-wrap gap-1.5">
          {config.columns.map((c, i) => (
            <span key={c} className="text-[11px] font-mono px-2 py-1 rounded bg-muted text-foreground">
              {i + 1}. {c}
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}
