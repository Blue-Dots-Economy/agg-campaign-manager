import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/user-level-analysis")({
  component: UserLevelAnalysis,
});

function UserLevelAnalysis() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">User Overview</h1>
      <p className="text-sm text-muted-foreground">This page is under construction.</p>
    </div>
  );
}
