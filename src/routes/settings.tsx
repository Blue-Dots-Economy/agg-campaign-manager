import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useProgram } from "@/programs/context";
import { getOverrides, setOverrides, useProgramOverrides } from "@/lib/program-overrides";
import { rayaKeyStatus } from "@/lib/raya.functions";
import { Panel } from "@/components/Panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

function Settings() {
  const { config, programId } = useProgram();
  const overrides = useProgramOverrides(programId);

  const [agentId, setAgentId] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);

  const keyStatusFn = useServerFn(rayaKeyStatus);

  useEffect(() => {
    const o = getOverrides(programId);
    setAgentId(o.rayaAgentId ?? config.rayaAgentId ?? "");
    setSheetUrl(o.sheetCsvUrl ?? config.sheetCsvUrl ?? "");
  }, [programId, config]);

  useEffect(() => {
    keyStatusFn({ data: undefined as any })
      .then((r: any) => setKeyConfigured(Boolean(r?.configured)))
      .catch(() => setKeyConfigured(false));
  }, [keyStatusFn]);

  const save = () => {
    setOverrides(programId, { rayaAgentId: agentId, sheetCsvUrl: sheetUrl });
    toast.success("Settings saved");
  };

  return (
    <div className="space-y-6">
      <Panel title="Raya API key" description="Stored as a backend secret · never sent to the browser">
        {keyConfigured === null ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : keyConfigured ? (
          <div className="flex items-center gap-2 rounded-md bg-brand-soft text-brand px-3 py-2 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            <span><strong>RAYA_API_KEY</strong> is set.</span>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>
              <p><strong>RAYA_API_KEY</strong> is not set.</p>
              <p className="text-xs mt-1 text-destructive/80">
                Add it in Project Settings → Secrets, then reload this page.
              </p>
            </div>
          </div>
        )}
      </Panel>

      <Panel title={`${config.label} settings`} description="Per-program configuration (saved locally for this session)">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="agent" className="text-xs">Raya agent id</Label>
            <Input
              id="agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="e.g. agt_abc123"
              className="mt-1 font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Used by createBatch, startBatch, listBatches and initiateCall for the {config.label} program.
            </p>
          </div>
          <div>
            <Label htmlFor="sheet" className="text-xs">Connected sheet (CSV URL)</Label>
            <Input
              id="sheet"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/…/pub?output=csv"
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between border-t pt-3 mt-1">
            <p className="text-xs text-muted-foreground">
              Active agent: <span className="font-mono">{overrides.rayaAgentId || config.rayaAgentId || "—"}</span>
            </p>
            <Button className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={save}>
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
