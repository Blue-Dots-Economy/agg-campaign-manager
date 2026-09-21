import { createServerFn } from "@tanstack/react-start";
import { setCookie, getCookie } from "@tanstack/react-start/server";

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

const UAT_TOKEN_URL = "https://auth-bluedots.bluedotseconomy.org/auth/realms/bluedots/protocol/openid-connect/token";
const CM_CLIENT_ID = "campaign-manager";

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  try {
    const part = jwt.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch { return {}; }
}

// Exchanges the OTP-login authorization code for tokens (server-side, uses the client_secret),
// stores the tokens in an httpOnly cookie, and returns ONLY the coordinator's identity.
export const exchangeCoordinatorCode = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; codeVerifier: string; redirectUri: string }) => d)
  .handler(async ({ data }) => {
    const secret = process.env.CM_UAT_CLIENT_SECRET;
    if (!secret) throw new Error("CM_UAT_CLIENT_SECRET not set");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CM_CLIENT_ID,
      client_secret: secret,
      code: data.code,
      redirect_uri: data.redirectUri,
      code_verifier: data.codeVerifier,
    });
    const res = await fetch(UAT_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`token exchange ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const tok = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    const claims = decodeJwtPayload(tok.access_token);
    const email = String(claims.email ?? claims.preferred_username ?? "").toLowerCase();
    const orgId = String(claims.signalstack_org_id ?? "");
    const aggregatorId = String(claims.aggregator_id ?? "");
    const name = (claims.name as string) ?? (claims.given_name as string) ?? null;

    const sessionVal = JSON.stringify({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? null,
      expires_at: Date.now() + (tok.expires_in ?? 300) * 1000,
      org_id: orgId,
      aggregator_id: aggregatorId,
    });
    try {
      setCookie("cm_tokens", sessionVal, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
    } catch (e) { console.error("setCookie cm_tokens failed", e); }

    return { ok: true as const, email, org_id: orgId, aggregator_id: aggregatorId, name };
  });

const UAT_API_BASE = "https://aggregators.bluedotseconomy.org/backend";

interface CmSession {
  access_token: string;
  refresh_token: string | null;
  expires_at: number;
  org_id?: string;
  aggregator_id?: string;
}

async function refreshCoordinatorToken(refreshToken: string): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const secret = process.env.CM_UAT_CLIENT_SECRET;
  if (!secret) throw new Error("CM_UAT_CLIENT_SECRET not set");
  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: CM_CLIENT_ID, client_secret: secret, refresh_token: refreshToken });
  const res = await fetch(UAT_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error(`refresh ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
}

// Reads the coordinator session cookie; refreshes the access token (and re-stores the cookie) if it's within 30s of expiry.
async function getCoordinatorAccessToken(): Promise<string> {
  const raw = getCookie("cm_tokens");
  if (!raw) throw new Error("Not signed in as a coordinator.");
  let sess: CmSession;
  try { sess = JSON.parse(raw) as CmSession; } catch { throw new Error("Invalid coordinator session — please sign in again."); }
  if (sess.access_token && sess.expires_at && Date.now() < sess.expires_at - 30_000) return sess.access_token;
  if (!sess.refresh_token) throw new Error("Coordinator session expired — please sign in again.");
  const tok = await refreshCoordinatorToken(sess.refresh_token);
  const updated: CmSession = { ...sess, access_token: tok.access_token, refresh_token: tok.refresh_token ?? sess.refresh_token, expires_at: Date.now() + (tok.expires_in ?? 300) * 1000 };
  try { setCookie("cm_tokens", JSON.stringify(updated), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 }); } catch (e) { console.error("re-store cm_tokens failed", e); }
  return tok.access_token;
}

async function cmCampaignPost(path: string, jsonBody: unknown, idempotencyKey: string): Promise<unknown> {
  const token = await getCoordinatorAccessToken();
  const res = await fetch(`${UAT_API_BASE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(jsonBody),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${path} ${res.status}: ${text.slice(0, 400)}`);
  return data;
}

type CmMetadata = Array<{ key: string; value: string }>;

// Lightweight, non-sensitive: does a coordinator session exist, and for which org? (never returns tokens)
export const getCoordinatorSession = createServerFn({ method: "GET" }).handler(async () => {
  const raw = getCookie("cm_tokens");
  if (!raw) return { signedIn: false as const };
  try {
    const s = JSON.parse(raw) as CmSession;
    return { signedIn: true as const, org_id: s.org_id ?? null, aggregator_id: s.aggregator_id ?? null, expires_at: s.expires_at ?? null };
  } catch { return { signedIn: false as const }; }
});

export const dispatchVoiceCampaign = createServerFn({ method: "POST" })
  .inputValidator((d: { itemIds: string[]; content: { agent_id: string; batch_name?: string; variables?: string[]; schedule?: string; max_retries?: number; retry_after_hrs?: number; max_concurrent_calls?: number; selected_statuses?: string[] }; metadata?: CmMetadata; idempotencyKey?: string }) => d)
  .handler(async ({ data }) => {
    const key = data.idempotencyKey || crypto.randomUUID();
    return cmCampaignPost("/v1/campaign/voice", { item_ids: data.itemIds, metadata: data.metadata ?? [], content: data.content }, key);
  });

export const sendEmailCampaign = createServerFn({ method: "POST" })
  .inputValidator((d: { itemIds: string[]; content: { subject: string; body_markdown: string; reply_to?: string }; metadata?: CmMetadata; idempotencyKey?: string }) => d)
  .handler(async ({ data }) => {
    const key = data.idempotencyKey || crypto.randomUUID();
    return cmCampaignPost("/v1/campaign/email", { item_ids: data.itemIds, metadata: data.metadata ?? [], content: data.content }, key);
  });

export const requestPiiExport = createServerFn({ method: "POST" })
  .inputValidator((d: { itemIds: string[]; metadata?: CmMetadata; idempotencyKey?: string }) => d)
  .handler(async ({ data }) => {
    const key = data.idempotencyKey || crypto.randomUUID();
    return cmCampaignPost("/v1/campaign/export", { item_ids: data.itemIds, metadata: data.metadata ?? [], content: {} }, key);
  });

export const getCampaignJob = createServerFn({ method: "GET" })
  .inputValidator((d: { channel: "voice" | "email" | "export"; jobId: string }) => d)
  .handler(async ({ data }) => {
    const token = await getCoordinatorAccessToken();
    const res = await fetch(`${UAT_API_BASE}/v1/campaign/${data.channel}/${encodeURIComponent(data.jobId)}`, { headers: { authorization: `Bearer ${token}` } });
    const text = await res.text();
    if (!res.ok) throw new Error(`job ${res.status}: ${text.slice(0, 400)}`);
    return text ? JSON.parse(text) : null;
  });

export const listCampaignJobs = createServerFn({ method: "GET" })
  .inputValidator((d: { channel: "voice" | "email" | "export"; limit?: number; cursor?: string }) => d)
  .handler(async ({ data }) => {
    const token = await getCoordinatorAccessToken();
    const qs = new URLSearchParams();
    if (data.limit) qs.set("limit", String(data.limit));
    if (data.cursor) qs.set("cursor", data.cursor);
    const q = qs.toString();
    const res = await fetch(`${UAT_API_BASE}/v1/campaign/${data.channel}${q ? `?${q}` : ""}`, { headers: { authorization: `Bearer ${token}` } });
    const text = await res.text();
    if (!res.ok) throw new Error(`list ${res.status}: ${text.slice(0, 400)}`);
    return text ? JSON.parse(text) : null;
  });
