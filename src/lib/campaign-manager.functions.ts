import { createServerFn } from "@tanstack/react-start";

// Sanketika Campaign Manager API — UAT (bluedots) instance config. Non-secret URLs;
// only the client_secret is a secret (env CM_UAT_CLIENT_SECRET).
const UAT = {
  keycloak: "https://auth-bluedots.bluedotseconomy.org/auth",
  realm: "bluedots",
  base: "https://aggregators.bluedotseconomy.org/backend",
  clientId: "campaign-manager",
  secretEnv: "CM_UAT_CLIENT_SECRET",
};

async function getSystemToken(cfg: typeof UAT): Promise<string> {
  const secret = process.env[cfg.secretEnv];
  if (!secret) throw new Error(`${cfg.secretEnv} is not set`);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: cfg.clientId,
    client_secret: secret,
  });
  const res = await fetch(`${cfg.keycloak}/realms/${cfg.realm}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("no access_token in token response");
  return j.access_token;
}

// Tests the whole Phase B pipe: system token -> GET /v1/campaign/dump -> download the
// smallest file (user) and parse it, to prove the data is reachable. All non-PII.
export const testCampaignDump = createServerFn({ method: "POST" }).handler(async () => {
  const cfg = UAT;
  try {
    if (!process.env[cfg.secretEnv]) return { ok: false as const, step: "config", error: `${cfg.secretEnv} not set` };
    const token = await getSystemToken(cfg);
    const res = await fetch(`${cfg.base}/v1/campaign/dump`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return { ok: false as const, step: "dump", tokenOk: true, status: res.status, error: (await res.text()).slice(0, 400) };
    const dump = (await res.json()) as { network?: string; instance?: string; expires_at?: string; files?: Array<{ table: string; size_bytes?: number; last_modified?: string; url?: string }> };
    const files = (dump.files ?? []).map((f) => ({ table: f.table, size_bytes: f.size_bytes, last_modified: f.last_modified, hasUrl: !!f.url }));

    // Download + parse the smallest file (user) with NO auth header (signature is in the URL).
    let sample: { table: string; lineCount: number; sampleKeys: string[] } | null = null;
    const userFile = (dump.files ?? []).find((f) => f.table === "user") ?? (dump.files ?? [])[0];
    if (userFile?.url) {
      const f = await fetch(userFile.url);
      if (f.ok) {
        const buf = Buffer.from(await f.arrayBuffer());
        const { gunzipSync } = await import("node:zlib");
        const text = gunzipSync(buf).toString("utf8");
        const lines = text.split("\n").filter((l) => l.trim());
        let keys: string[] = [];
        try { keys = Object.keys(JSON.parse(lines[0] ?? "{}")); } catch { /* ignore */ }
        sample = { table: userFile.table ?? "user", lineCount: lines.length, sampleKeys: keys };
      }
    }
    return { ok: true as const, tokenOk: true, network: dump.network ?? null, instance: dump.instance ?? null, expires_at: dump.expires_at ?? null, files, sample };
  } catch (e) {
    return { ok: false as const, step: "exception", error: e instanceof Error ? e.message : String(e) };
  }
});
