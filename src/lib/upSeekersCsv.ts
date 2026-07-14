import bundledCsv from "@/data/up-seekers.csv?raw";

export type Seeker = {
  id: string;
  userId: string;
  name: string;
  location: string;
  role: string;
  createdOn: string;
  profileAge: number | null;
  lastAppliedAge: number | null;
  applications: number;
  shortlisted: number;
  rejected: number;
  profileCompletion: number;
  followUpFor: string;
  status: "New" | "Active" | "At Risk" | "Inactive";
  profileStatus: "Complete" | "Incomplete";
  recommendedAction: string;
};

const STORAGE_KEY = "up-seekers-csv-v1";
const META_KEY = "up-seekers-csv-meta-v1";

export type CsvMeta = { name: string; uploadedAt: string; rows: number };

// Minimal RFC4180-ish CSV parser (handles quoted fields with commas/newlines/escaped quotes)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        cur.push(field);
        field = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c && c.trim().length > 0));
}

function toIntOrNull(v: string | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function toInt(v: string | undefined): number {
  const n = toIntOrNull(v);
  return n ?? 0;
}
function toPct(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function computeStatus(profileAge: number | null, lastAppliedAge: number | null): Seeker["status"] {
  const p = profileAge ?? 9999;
  if (p <= 7) return "New";
  const la = lastAppliedAge;
  if (la !== null && la <= 30) return "Active";
  if (la !== null && la >= 31 && la <= 90) return "At Risk";
  return "Inactive";
}

function computeAction(
  status: Seeker["status"],
  profileStatus: Seeker["profileStatus"],
  lastAppliedAge: number | null,
  csvAction: string,
): string {
  if (profileStatus === "Incomplete") return "Complete Profile";
  switch (status) {
    case "New":
    case "At Risk":
      return "Automated Call";
    case "Inactive":
      return "Manual Call";
    case "Active":
      if (lastAppliedAge !== null && lastAppliedAge > 14) return "Automated Call";
      return csvAction?.trim() || "No Action";
  }
}

export function parseSeekersCsv(text: string): Seeker[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name.toLowerCase());
  const cId = idx("id");
  const cUser = idx("user_id");
  const cName = idx("name");
  const cLoc = idx("location");
  const cRole = idx("role");
  const cAction = idx("recommended action");
  const cApps = idx("applications");
  const cShort = idx("shortlisted");
  const cRej = idx("rejected");
  const cCompl = idx("profile completion");
  const cFollow = idx("follow up for");
  const cCreated = idx("created_on");
  const cPAge = idx("profile age");
  const cLApp = idx("last applied age");

  const out: Seeker[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = (r[cId] ?? "").trim();
    if (!id) continue;
    const completion = toPct(r[cCompl]);
    const profileStatus: Seeker["profileStatus"] = completion >= 100 ? "Complete" : "Incomplete";
    const profileAge = toIntOrNull(r[cPAge]);
    const lastAppliedAge = toIntOrNull(r[cLApp]);
    const status = computeStatus(profileAge, lastAppliedAge);
    out.push({
      id,
      userId: (r[cUser] ?? "").trim(),
      name: (r[cName] ?? "").trim(),
      location: (r[cLoc] ?? "").trim(),
      role: (r[cRole] ?? "").trim(),
      createdOn: (r[cCreated] ?? "").trim(),
      profileAge,
      lastAppliedAge,
      applications: toInt(r[cApps]),
      shortlisted: toInt(r[cShort]),
      rejected: toInt(r[cRej]),
      profileCompletion: completion,
      followUpFor: (r[cFollow] ?? "").trim(),
      status,
      profileStatus,
      recommendedAction: computeAction(status, profileStatus, lastAppliedAge, r[cAction] ?? ""),
    });
  }
  return out;
}

export function loadSeekers(): { seekers: Seeker[]; meta: CsvMeta } {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const metaRaw = window.localStorage.getItem(META_KEY);
      if (stored) {
        const seekers = parseSeekersCsv(stored);
        const meta: CsvMeta = metaRaw
          ? JSON.parse(metaRaw)
          : { name: "Uploaded CSV", uploadedAt: "", rows: seekers.length };
        return { seekers, meta };
      }
    } catch {
      /* fall through to bundled */
    }
  }
  const seekers = parseSeekersCsv(bundledCsv);
  return {
    seekers,
    meta: { name: "UP_Seeker_140720261141PM.csv (bundled)", uploadedAt: "", rows: seekers.length },
  };
}

export function saveUploadedCsv(
  name: string,
  text: string,
): { seekers: Seeker[]; meta: CsvMeta; persisted: boolean } {
  const seekers = parseSeekersCsv(text);
  let persisted = false;
  const meta: CsvMeta = { name, uploadedAt: new Date().toISOString(), rows: seekers.length };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, text);
      window.localStorage.setItem(META_KEY, JSON.stringify({ ...meta, persisted: true }));
      persisted = true;
    } catch {
      // Quota exceeded — CSV too large for localStorage. Keep in-memory only.
      try {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(META_KEY);
      } catch {
        /* ignore */
      }
    }
  }
  return { seekers, meta, persisted };
}

export function resetToBundled(): { seekers: Seeker[]; meta: CsvMeta } {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(META_KEY);
  }
  return loadSeekers();
}
