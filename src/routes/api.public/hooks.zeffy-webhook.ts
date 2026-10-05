import { createFileRoute } from "@tanstack/react-router";
import { processZeffyWebhook } from "@/lib/donations.functions";

// Zeffy payment webhook. Configured in Zeffy's dashboard with ?token=<ZEFFY_WEBHOOK_TOKEN>.
export const Route = createFileRoute("/api/public/hooks/zeffy-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const token = new URL(request.url).searchParams.get("token");
        const result = (await processZeffyWebhook({ data: { token, payload: body as Record<string, unknown> } })) as {
          ok: boolean;
        };
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 401,
          headers: { "Content-Type": "application/json" },
        });
      },
      GET: async () => {
        return new Response(JSON.stringify({ ok: true, hint: "Zeffy posts payment.completed here" }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
