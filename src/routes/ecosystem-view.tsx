import { createFileRoute } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";

export const Route = createFileRoute("/ecosystem-view")({
  component: EcosystemView,
  head: () => ({
    meta: [
      { title: "Ecosystem View · Coming Soon" },
      { name: "description", content: "Ecosystem view is coming soon." },
      { property: "og:title", content: "Ecosystem View · Coming Soon" },
      { property: "og:description", content: "Ecosystem view is coming soon." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function EcosystemView() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-6">
      <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
        <Briefcase className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Ecosystem View</h1>
      <p className="mt-3 text-muted-foreground max-w-md">
        A unified view of your entire partner and program ecosystem is on the way.
      </p>
      <span className="mt-6 inline-flex items-center rounded-full border border-dashed px-3 py-1 text-sm font-medium text-muted-foreground">
        Coming soon
      </span>
    </div>
  );
}
