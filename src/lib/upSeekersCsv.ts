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

const DB_NAME = "up-seekers-db";
const DB_VERSION = 1;
const STORE = "csv";
const CSV_KEY = "current-csv";
const META_KEY_IDB = "current-meta";
// Legacy localStorage keys (migrated away from due to 5MB quota).
const LS_STORAGE_KEY = "up-seekers-csv-v1";
const LS_META_KEY = "up-seekers-csv-meta-v1";

export type CsvMeta = { name: string; uploadedAt: string; rows: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

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

/** Default exclusion: rows flagged as test data are dropped from any linked sheet/CSV.
 * Treats "1", "1.0", "true", "yes", "y" (case-insensitive) as test = 1 flags. */
function isTestRow(v: string | undefined): boolean {
  if (!v) return false;
  const normalized = v.trim().toLowerCase();
  return ["1", "1.0", "true", "yes", "y"].includes(normalized);
}

function norm(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Location must be filled AND contain more than just the district/state (or their combination). */
function isLocationMeaningful(location: string, district: string, state: string): boolean {
  const loc = norm(location);
  if (!loc) return false;
  const d = norm(district);
  const s = norm(state);
  const combos = new Set(
    [d, s, d && s ? `${d}, ${s}` : "", d && s ? `${s}, ${d}` : "", d && s ? `${d} ${s}` : "", d && s ? `${d},${s}` : ""].filter(Boolean),
  );
  return !combos.has(loc);
}

/** Profile completeness rules:
 *  1) name not blank
 *  2) location not blank and not just city/state name(s)
 *  3) email OR phone filled
 *  4) age not blank
 *  5) role not blank and not "any"
 *  6) expected salary not blank
 */
function computeProfileChecks(r: {
  name: string;
  location: string;
  district: string;
  state: string;
  email: string;
  phone: string;
  age: string;
  role: string;
  salary: string;
}): { passed: number; total: number } {
  const checks = [
    r.name.trim().length > 0,
    isLocationMeaningful(r.location, r.district, r.state),
    r.email.trim().length > 0 || r.phone.trim().length > 0,
    r.age.trim().length > 0,
    r.role.trim().length > 0 && norm(r.role) !== "any",
    r.salary.trim().length > 0,
  ];
  return { passed: checks.filter(Boolean).length, total: checks.length };
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
  const cDistrict = idx("location_district");
  const cState = idx("location_state");
  const cEmail = idx("email id");
  const cPhone = idx("phone number");
  const cAge = idx("age");
  const cSalary = idx("expected salary");
  const cRole = idx("role");
  const cAction = idx("recommended action");
  const cApps = idx("applications");
  const cShort = idx("shortlisted");
  const cRej = idx("rejected");
  const cFollow = idx("follow up for");
  const cCreated = idx("created_on");
  const cPAge = idx("profile age");
  const cLApp = idx("last applied age");
  const cTest = idx("test");

  const out: Seeker[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = (r[cId] ?? "").trim();
    if (!id) continue;
    if (cTest !== -1 && isTestRow(r[cTest])) continue;
    const checks = computeProfileChecks({
      name: r[cName] ?? "",
      location: r[cLoc] ?? "",
      district: cDistrict !== -1 ? (r[cDistrict] ?? "") : "",
      state: cState !== -1 ? (r[cState] ?? "") : "",
      email: cEmail !== -1 ? (r[cEmail] ?? "") : "",
      phone: cPhone !== -1 ? (r[cPhone] ?? "") : "",
      age: cAge !== -1 ? (r[cAge] ?? "") : "",
      role: r[cRole] ?? "",
      salary: cSalary !== -1 ? (r[cSalary] ?? "") : "",
    });
    const completion = Math.round((checks.passed / checks.total) * 100);
    const profileStatus: Seeker["profileStatus"] = checks.passed === checks.total ? "Complete" : "Incomplete";
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


function bundledResult(): { seekers: Seeker[]; meta: CsvMeta } {
  const seekers = parseSeekersCsv(bundledCsv);
  return {
    seekers,
    meta: { name: "UP_Seeker_140720261141PM.csv (bundled)", uploadedAt: "", rows: seekers.length },
  };
}

/** Synchronous initial load — returns the bundled CSV. Use `loadSeekersAsync` after mount to pick up any IndexedDB-persisted upload. */
export function loadSeekers(): { seekers: Seeker[]; meta: CsvMeta } {
  return bundledResult();
}

export async function loadSeekersAsync(): Promise<{ seekers: Seeker[]; meta: CsvMeta }> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return bundledResult();
  try {
    // One-time migration from the old localStorage entries.
    try {
      const legacyText = window.localStorage.getItem(LS_STORAGE_KEY);
      if (legacyText) {
        const legacyMeta = window.localStorage.getItem(LS_META_KEY);
        await idbSet(CSV_KEY, legacyText);
        if (legacyMeta) await idbSet(META_KEY_IDB, JSON.parse(legacyMeta));
        window.localStorage.removeItem(LS_STORAGE_KEY);
        window.localStorage.removeItem(LS_META_KEY);
      }
    } catch {
      /* ignore migration errors */
    }

    const stored = await idbGet<string>(CSV_KEY);
    if (!stored) return bundledResult();
    const seekers = parseSeekersCsv(stored);
    const meta =
      (await idbGet<CsvMeta>(META_KEY_IDB)) ?? {
        name: "Uploaded CSV",
        uploadedAt: "",
        rows: seekers.length,
      };
    return { seekers, meta };
  } catch {
    return bundledResult();
  }
}

export async function saveUploadedCsv(
  name: string,
  text: string,
): Promise<{ seekers: Seeker[]; meta: CsvMeta; persisted: boolean }> {
  const seekers = parseSeekersCsv(text);
  const meta: CsvMeta = { name, uploadedAt: new Date().toISOString(), rows: seekers.length };
  let persisted = false;
  if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
    try {
      await idbSet(CSV_KEY, text);
      await idbSet(META_KEY_IDB, meta);
      persisted = true;
    } catch {
      // Storage failed (quota or disabled). Keep the parsed data in-memory only.
      try {
        await idbDel(CSV_KEY);
        await idbDel(META_KEY_IDB);
      } catch {
        /* ignore */
      }
    }
  }
  return { seekers, meta, persisted };
}

export async function resetToBundled(): Promise<{ seekers: Seeker[]; meta: CsvMeta }> {
  if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
    try {
      await idbDel(CSV_KEY);
      await idbDel(META_KEY_IDB);
    } catch {
      /* ignore */
    }
  }
  return bundledResult();
}

