// Server-only. Loads the Ecosystem View from Palak's Blue Dots Supabase
// (a separate external project, schema `bluedot`), shaped to EcoPayload.
// Env: ECO_SUPABASE_URL / ECO_SUPABASE_SERVICE_ROLE_KEY. Requires the `bluedot`
// schema to be exposed in that project's PostgREST settings.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { EcoPayload, EcoJob, EcoApplication } from "./ecosystem.server";

function ecoClient(): SupabaseClient | null {
  const url = process.env.ECO_SUPABASE_URL;
  const key = process.env.ECO_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    db: { schema: "bluedot" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function ecoBlueDotsAvailable(): boolean {
  return !!(process.env.ECO_SUPABASE_URL && process.env.ECO_SUPABASE_SERVICE_ROLE_KEY);
}

async function fetchAll<T>(make: () => any): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await make().range(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

const asNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function loadEcosystemFromBlueDots(state: string, district: string): Promise<EcoPayload> {
  const sb = ecoClient();
  if (!sb) throw new Error("ECO_SUPABASE env not set");
  const inst = state; // `instance` column === state (KA / UP)

  type JobRow = { item_id: string; employer: string | null; role_raw: string | null; nature_of_job: string | null; positions: number | null; salary_min: number | null; salary_max: number | null; lifecycle_status: string | null; created_at: string | null };
  const jobRows = await fetchAll<JobRow>(() =>
    sb.from("job_postings").select("item_id,employer,role_raw,nature_of_job,positions,salary_min,salary_max,lifecycle_status,created_at").eq("instance", inst),
  );

  type ActRow = { action_id: string; source_item_id: string | null; target_item_id: string | null; created_at: string | null };
  const actRows = await fetchAll<ActRow>(() =>
    sb.from("item_actions").select("action_id,source_item_id,target_item_id,created_at").eq("instance", inst).eq("action_type", "apply"),
  );
  const appsByJob = new Map<string, number>();
  for (const a of actRows) {
    if (!a.target_item_id) continue;
    appsByJob.set(a.target_item_id, (appsByJob.get(a.target_item_id) ?? 0) + 1);
  }

  const jobs: EcoJob[] = jobRows.map((r, i) => {
    const status = String(r.lifecycle_status ?? "").toLowerCase();
    return {
      id: r.item_id || `${state}-${i}`,
      title: r.role_raw || "—",
      category: r.nature_of_job || "—",
      sector: r.nature_of_job || "—",
      partial_fit_seekers: 0,
      right_fit_seekers: 0,
      area: "—",
      current_openings: asNum(r.positions),
      applications: appsByJob.get(r.item_id) ?? 0,
      status: (status.includes("closed") || status.includes("filled") || status.includes("archived")) ? "closed" : "open",
      posted_date: r.created_at || "",
      posted_by: r.employer || "—",
      salary_offered: asNum(r.salary_min),
      shortlisted: 0,
      application_pending_from: "",
      recommended_action_provider: "",
      recommended_action_seeker: "",
      contact_name: "",
      contact_phone: "",
      contact_email: "",
      location_district: district,
      location_state: state,
    };
  });

  const applications: EcoApplication[] = actRows.map((a, i) => ({
    id: a.action_id || `${state}-A-${i}`,
    seeker_role: "—",
    location: "",
    job_id: a.target_item_id || "",
    applied_date: a.created_at || "",
  }));

  const { count: profileCount } = await sb
    .from("seeker_profiles")
    .select("*", { count: "exact", head: true })
    .eq("instance", inst);
  const profiles = profileCount ?? 0;

  const now = Date.now();
  const buckets = { week: 0, month: 0, older: 0 };
  for (const a of applications) {
    const t = new Date(a.applied_date).getTime();
    if (!Number.isFinite(t)) { buckets.older++; continue; }
    const days = (now - t) / 86400000;
    if (days < 7) buckets.week++;
    else if (days <= 30) buckets.month++;
    else buckets.older++;
  }

  return {
    jobs,
    applications: { total: applications.length, buckets, sample: applications.slice(0, 500) },
    seekerCounts: { profiles, accounts: profiles, orgs: 0 },
    lastSyncedAt: new Date().toISOString(),
    unmapped: [],
  };
}
