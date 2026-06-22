import { Upload, Rocket, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProgram } from "@/programs/context";
import { Link } from "@tanstack/react-router";
import { useSyncProgram, useProgramAggregates } from "@/programs/useProgramAggregates";

export function TopBar() {
  const { config } = useProgram();
  const sync = useSyncProgram(config.id);
  const query = useProgramAggregates(config);
  const lastSynced = query.data?.lastSyncedAt;
  const ago = lastSynced ? timeAgo(lastSynced) : "never";

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b bg-background">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Operation Rozgar</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Here's how {config.label} is performing
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft text-brand px-3 py-1 text-xs font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          {config.label} program
        </span>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          title={`Last synced ${ago}`}
        >
          <RefreshCw className={`h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
          {sync.isPending ? "Syncing…" : "Refresh"}
        </Button>
        <Link to="/launch">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Upload className="h-4 w-4" /> Upload CSV
          </Button>
        </Link>
        <Link to="/launch">
          <Button size="sm" className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
            <Rocket className="h-4 w-4" /> Launch campaign
          </Button>
        </Link>
      </div>
    </header>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
