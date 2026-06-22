import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/test-sheets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sheetId = url.searchParams.get("sheet_id") ?? "1vf--WBbTlfnNJWai5keuWDybi0_sLt1Wi2DZa66lnxk";
        const tab = url.searchParams.get("tab") ?? "Sheet1";
        try {
          const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
          if (!raw) return Response.json({ ok: false, stage: "env", error: "GOOGLE_SERVICE_ACCOUNT_JSON not set" });
          let parsed: { client_email?: string; private_key?: string };
          try { parsed = JSON.parse(raw); } catch (e) {
            return Response.json({ ok: false, stage: "parse", error: String(e), len: raw.length, head: raw.slice(0, 40) });
          }
          const info = {
            client_email: parsed.client_email,
            pk_has_begin: parsed.private_key?.includes("BEGIN PRIVATE KEY"),
            pk_has_literal_backslash_n: parsed.private_key?.includes("\\n"),
            pk_has_real_newline: parsed.private_key?.includes("\n"),
            pk_len: parsed.private_key?.length,
          };
          const { readSheet } = await import("@/lib/sheets.server");
          try {
            const r = await readSheet(sheetId, tab);
            return Response.json({ ok: true, info, headerCount: r.headers.length, rowCount: r.rowCount });
          } catch (e) {
            return Response.json({ ok: false, stage: "read", info, error: e instanceof Error ? e.message : String(e) });
          }
        } catch (e) {
          return Response.json({ ok: false, stage: "outer", error: e instanceof Error ? e.message : String(e) });
        }
      },
    },
  },
});
