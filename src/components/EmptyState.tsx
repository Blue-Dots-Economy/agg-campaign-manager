import { Link } from "@tanstack/react-router";
import { Database } from "lucide-react";
import { Panel } from "@/components/Panel";
import { Skeleton } from "@/components/ui/skeleton";

export function NoDataState() {
  return (
    <Panel title="No data yet">
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="rounded-full bg-brand-soft p-3 text-brand">
          <Database className="h-6 w-6" />
        </div>
        <p className="text-sm text-muted-foreground max-w-md">
          No data yet — connect a sheet in{" "}
          <Link to="/connections" className="text-brand underline">
            Connections
          </Link>{" "}
          to start seeing live KPIs, charts and call rows here.
        </p>
      </div>
    </Panel>
  );
}

export function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
