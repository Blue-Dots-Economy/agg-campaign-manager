// Server-only helper: read a Google Sheet via service-account JWT.
// Imported only by *.functions.ts handlers (loaded inside the handler body).
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
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

export interface SheetReadResult {
  headers: string[];
  rows: string[][];
  rowCount: number;
}

export async function readSheet(sheetId: string, tabName?: string): Promise<SheetReadResult> {
  const token = await getAccessToken();
  const range = tabName ? `${encodeURIComponent(tabName)}!A1:ZZ100000` : "A1:ZZ100000";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets read failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  const values = data.values ?? [];
  if (values.length === 0) return { headers: [], rows: [], rowCount: 0 };
  const [headers, ...rows] = values;
  return { headers: headers.map((h) => String(h ?? "").trim()), rows, rowCount: rows.length };
}
