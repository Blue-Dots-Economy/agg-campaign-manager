import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/review/$callId")({
  validateSearch: (s: Record<string, unknown>) => ({ bulk: typeof s.bulk === "string" ? s.bulk : undefined }),
  component: ReviewDetailPlaceholder,
});

function ReviewDetailPlaceholder() {
  const { callId } = Route.useParams();
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
      Transcript review for <span className="font-mono text-foreground">{callId}</span> — coming in phase 3b.
    </div>
  );
}
