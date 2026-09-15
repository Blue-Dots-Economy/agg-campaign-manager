import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { testCampaignDump } from "@/lib/campaign-manager.functions";

export const Route = createFileRoute("/cm-test")({ component: CmTest });

function CmTest() {
  const fn = useServerFn(testCampaignDump);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <h1 className="text-xl font-semibold">Campaign Manager — Phase B dump test (UAT)</h1>
      <p className="text-sm text-muted-foreground">System-token → GET /v1/campaign/dump → download + parse the user file. Non-PII.</p>
      <Button disabled={busy} onClick={async () => { setBusy(true); try { setResult(await fn({})); } catch (e) { setResult({ error: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); } }}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Run dump test
      </Button>
      {result != null && (
        <Panel><pre className="text-xs overflow-auto whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre></Panel>
      )}
    </div>
  );
}
