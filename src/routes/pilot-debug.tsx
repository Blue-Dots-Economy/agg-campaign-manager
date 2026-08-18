import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

const pilotDebug = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  let cookiePresent = false;
  let actor: string | null = null;
  try {
    const cookie = getRequest()?.headers?.get("cookie");
    cookiePresent = !!cookie;
    if (cookie) {
      const m = cookie.split("; ").find((c) => c.startsWith("rozgar_auth="));
      if (m) {
        const raw = decodeURIComponent(m.split("=").slice(1).join("="));
        actor = String(JSON.parse(raw)?.email ?? "").trim().toLowerCase() || null;
      }
    }
  } catch (e) {
    actor = "ERR:" + (e as Error).message;
  }
  const { usesSecondProject } = await import("@/lib/db.server");
  return {
    hasUrl: !!process.env.NEW_SUPABASE_URL,
    hasKey: !!process.env.NEW_SUPABASE_SERVICE_ROLE_KEY,
    cookiePresent,
    actor,
    uses: usesSecondProject(),
  };
});

export const Route = createFileRoute("/pilot-debug")({ component: PilotDebug });

function PilotDebug() {
  const fn = useServerFn(pilotDebug);
  const { data, isLoading, error } = useQuery({ queryKey: ["pilot-debug"], queryFn: () => fn() });
  return (
    <pre style={{ padding: 16, fontSize: 13, whiteSpace: "pre-wrap" }}>
      {isLoading ? "loading..." : error ? String(error) : JSON.stringify(data, null, 2)}
    </pre>
  );
}
