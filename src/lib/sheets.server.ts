// Server-only helper: read a Google Sheet via service-account JWT.
import { SignJWT, importPKCS8 } from "jose";

export interface ServiceAccountJson {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export const DEFAULT_SA_EMAIL = "blue-dots-admin@blue-dots-project.iam.gserviceaccount.com";

function parseServiceAccount(): ServiceAccountJson {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  let json: ServiceAccountJson;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!json.client_email || !json.private_key) {
    throw new Error("Service account JSON missing client_email or private_key");
  }
  return json;
}

let cached: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  const sa = parseServiceAccount();
  const pk = await importPKCS8(sa.private_key.replace(/\\n/g, "\n"), "RS256");
  const jwt = await new SignJWT({
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(sa.token_uri ?? "https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(pk);

  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

export interface SheetReadResult {
  headers: string[];
  rows: string[][];
  rowCount: number;
  effectiveTab: string;
}

function colLetter(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function quoteTab(tab: string): string {
  if (/^[A-Za-z0-9_]+$/.test(tab)) return `${tab}!`;
  return `'${tab.replace(/'/g, "''")}'!`;
}

// Columns excluded from the bulk read — they balloon Worker memory on 20k+ row sheets.
// Fetched on demand via getCallDetail when a user opens a specific call.
function normalizeHeader(h: string): string {
  return String(h ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}
const HEAVY_HEADERS_NORM = new Set([
  "call_transcript",
  "final_summary",
  "call_recording_url",
]);

/** Fetch the spreadsheet's tab titles in order. */
export async function listSheetTabs(sheetId: string): Promise<string[]> {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets metadata failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  return (data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
}

function isRangeParseError(msg: string): boolean {
  return /Unable to parse range|INVALID_ARGUMENT/i.test(msg);
}

async function readSheetForTab(
  sheetId: string,
  token: string,
  tab: string,
): Promise<SheetReadResult> {
  const tabPrefix = quoteTab(tab);
  const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabPrefix}A1:ZZ1`;
  const headerRes = await fetch(headerUrl, { headers: { authorization: `Bearer ${token}` } });
  if (!headerRes.ok) {
    const text = await headerRes.text();
    throw new Error(`Sheets read failed (${headerRes.status}): ${text.slice(0, 300)}`);
  }
  const headerJson = (await headerRes.json()) as { values?: string[][] };
  const allHeaders = (headerJson.values?.[0] ?? []).map((h) => String(h ?? "").trim());
  if (allHeaders.length === 0) return { headers: [], rows: [], rowCount: 0, effectiveTab: tab };

  const keep: number[] = [];
  allHeaders.forEach((h, i) => {
    if (!HEAVY_HEADERS.has(h)) keep.push(i);
  });
  const groups: Array<[number, number]> = [];
  for (const i of keep) {
    const last = groups[groups.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else groups.push([i, i]);
  }
  const ranges = groups.map(([s, e]) => `${tabPrefix}${colLetter(s)}2:${colLetter(e)}200000`);

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?` +
    ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&") +
    `&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets read failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { valueRanges?: Array<{ values?: unknown[][] }> };
  const segments = (data.valueRanges ?? []).map((vr) => vr.values ?? []);
  const rowCount = segments.reduce((m, s) => Math.max(m, s.length), 0);

  const keptHeaders: string[] = [];
  for (const [s, e] of groups) for (let i = s; i <= e; i++) keptHeaders.push(allHeaders[i]);

  const rows: string[][] = new Array(rowCount);
  for (let r = 0; r < rowCount; r++) {
    const out: string[] = [];
    for (let g = 0; g < segments.length; g++) {
      const [s, e] = groups[g];
      const width = e - s + 1;
      const segRow = (segments[g][r] ?? []) as unknown[];
      for (let i = 0; i < width; i++) {
        const v = segRow[i];
        out.push(v == null ? "" : String(v));
      }
    }
    rows[r] = out;
  }

  return { headers: keptHeaders, rows, rowCount, effectiveTab: tab };
}

/**
 * Reads a sheet. If tabName is missing or invalid, falls back to the first
 * tab in the spreadsheet. The returned `effectiveTab` reflects the tab actually
 * used so callers can persist any correction.
 */
export async function readSheet(sheetId: string, tabName?: string): Promise<SheetReadResult> {
  const token = await getAccessToken();
  const trimmed = (tabName ?? "").trim();

  if (trimmed) {
    try {
      return await readSheetForTab(sheetId, token, trimmed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRangeParseError(msg)) throw err;
      // Fall through to first-tab fallback below.
    }
  }

  const tabs = await listSheetTabs(sheetId);
  if (tabs.length === 0) throw new Error("Spreadsheet has no tabs");
  return await readSheetForTab(sheetId, token, tabs[0]);
}
