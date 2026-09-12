import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The master journey tables live in the campaign-manager project (NEW_SUPABASE_*),
// for ALL users — not sbFor(), which is per-actor/per-program.
function masterClient(): SupabaseClient | null {
  const url = process.env.NEW_SUPABASE_URL;
  const key = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const TABLE: Record<string, string> = {
  kkb: "aggregated_seeker_journey",
  dkb: "aggregated_provider_journey",
};

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return "";
}
function numOrNull(v: string): number | null {
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function norm10(s: string): string {
  return String(s ?? "").replace(/\D/g, "").slice(-10);
}

export interface MasterFilters {
  program: "kkb" | "dkb";
  confidenceMin?: number | null;
  maxCampaigns?: number | null;   // exclude if total_campaigns > this
  cooldownDays?: number | null;   // exclude if last_call_date within N days
  region?: string | null;
  status?: string | null;
  limit?: number | null;
}

interface Person {
  person_id: string; name: string; phone: string; phoneRaw: string;
  region: string; district: string; status: string; category: string;
  confidence: number | null; total_campaigns: number;
  last_call_date: string; avg_intent: number | null; max_intent: number | null; avg_match: number | null;
}

async function loadPeople(client: SupabaseClient, program: string): Promise<Person[]> {
  const table = TABLE[program];
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await client.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(error.message);
    const b = (data ?? []) as Record<string, unknown>[];
    rows.push(...b);
    if (b.length === 0 || rows.length >= 60000) break;
    from += b.length;
  }
  return rows.map((r): Person => {
    const g = (...ks: string[]) => pick(r, ks);
    const phoneRaw = g("phone", "contact_phone", "mobile", "phone_number", "seeker_phone", "provider_phone", "primary_phone");
    const phone = phoneRaw.replace(/\D/g, "").slice(-10);
    return {
      person_id: g("id", "seeker_id", "provider_id", "user_id", "person_id"),
      name: g("name", "seeker_name", "provider_name", "company_name", "full_name"),
      phone,
      phoneRaw: phoneRaw,
      region: g("region", "state", "instance", "location_state", "jfc_campaign"),
      district: g("district", "city", "location_district", "city_campaign"),
      status: g("status", "profile_status", "seeker_status", "provider_status"),
      category: g("category", "role", "trade", "sector", "nature_of_job"),
      confidence: numOrNull(g("call_confidence_score")),
      total_campaigns: numOrNull(g("total_campaigns")) ?? 0,
      last_call_date: g("last_call_date"),
      avg_intent: numOrNull(g("avg_intent_score")),
      max_intent: numOrNull(g("max_intent_score")),
      avg_match: numOrNull(g("avg_match_score")),
    };
  });
}

function applyFilters(people: Person[], f: MasterFilters): Person[] {
  const confidenceAvailable = people.some((p) => p.confidence != null);
  let out = people.filter((p) => p.phone.length === 10);
  if (f.region) out = out.filter((p) => p.region.toLowerCase() === f.region!.toLowerCase());
  if (f.status) out = out.filter((p) => p.status.toLowerCase() === f.status!.toLowerCase());
  if (f.confidenceMin != null && confidenceAvailable) out = out.filter((p) => (p.confidence ?? -1) >= f.confidenceMin!);
  if (f.maxCampaigns != null) out = out.filter((p) => p.total_campaigns <= f.maxCampaigns!);
  if (f.cooldownDays != null) {
    const cutoff = Date.now() - f.cooldownDays * 86400000;
    out = out.filter((p) => !p.last_call_date || (new Date(p.last_call_date).getTime() || 0) < cutoff);
  }
  return out;
}

function cooldownCutoff(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}
// Apply the Pick filters to a supabase query builder (server-side filtering).
function applyQueryFilters(q: any, f: MasterFilters): any {
  if (f.confidenceMin != null && f.program === "kkb") q = q.gte("call_confidence_score", f.confidenceMin);
  if (f.maxCampaigns != null) q = q.lte("total_campaigns", f.maxCampaigns);
  if (f.cooldownDays != null) q = q.or(`last_call_date.is.null,last_call_date.lt.${cooldownCutoff(f.cooldownDays)}`);
  if (f.region) q = q.eq("jfc_campaign", f.region);
  return q;
}

export const previewMasterCohort = createServerFn({ method: "POST" })
  .inputValidator((d: MasterFilters) => d)
  .handler(async ({ data }) => {
    const client = masterClient();
    if (!client) return { available: false, total: 0, confidenceAvailable: false, sample: [] as Array<Record<string, unknown>>, regions: [] as string[], statuses: [] as string[] };
    const table = TABLE[data.program];

    // Count only (head:true fetches no rows).
    const { count } = await applyQueryFilters(
      client.from(table).select("*", { count: "exact", head: true }),
      data,
    );

    // Confidence availability (KKB only) — cheap count of non-null scores.
    let confidenceAvailable = false;
    if (data.program === "kkb") {
      const { count: cAvail } = await client
        .from(table)
        .select("*", { count: "exact", head: true })
        .not("call_confidence_score", "is", null);
      confidenceAvailable = (cAvail ?? 0) > 0;
    }

    // De-identified sample (filtered, capped at 50).
    const sampleCols =
      data.program === "kkb"
        ? "phone, jfc_campaign, total_campaigns, last_call_date, call_confidence_score, avg_intent_score, max_intent_score, avg_match_score"
        : "phone, jfc_campaign, total_campaigns, last_call_date, avg_intent_score, max_intent_score";
    const { data: sRows } = await applyQueryFilters(
      client.from(table).select(sampleCols).limit(50),
      data,
    );
    const sample = ((sRows ?? []) as Record<string, unknown>[]).map((r) => {
      const ph = String(r.phone ?? "").replace(/\D/g, "");
      return {
        phone_masked: ph ? "•••••" + ph.slice(-4) : "",
        region: String(r.jfc_campaign ?? ""),
        district: "",
        status: "",
        category: "",
        confidence: r.call_confidence_score != null ? Number(r.call_confidence_score) : null,
        total_campaigns: Number(r.total_campaigns ?? 0),
        last_call_date: String(r.last_call_date ?? ""),
        avg_intent: r.avg_intent_score != null ? Number(r.avg_intent_score) : null,
        max_intent: r.max_intent_score != null ? Number(r.max_intent_score) : null,
        avg_match: r.avg_match_score != null ? Number(r.avg_match_score) : null,
      };
    });

    // Region facets = distinct jfc_campaign (one small column).
    const { data: fRows } = await client.from(table).select("jfc_campaign").limit(50000);
    const regions = Array.from(
      new Set(((fRows ?? []) as Record<string, unknown>[]).map((r) => String(r.jfc_campaign ?? "")).filter(Boolean)),
    ).sort();

    return { available: true, total: count ?? 0, confidenceAvailable, sample, regions, statuses: [] as string[] };
  });

export const resolveMasterCohort = createServerFn({ method: "POST" })
  .inputValidator((d: MasterFilters) => d)
  .handler(async ({ data }) => {
    const client = masterClient();
    if (!client) return { contacts: [] as Array<Record<string, string>>, enrichedCount: 0 };
    const people = await loadPeople(client, data.program);
    let filtered = applyFilters(people, data);
    if (data.limit && data.limit > 0) filtered = filtered.slice(0, data.limit);

    // Enrichment (KKB only): attach each person's recommendations from kkb_mastersheet, joined by phone.
    const recByPhone = new Map<string, { recommendations: string; jobs_recommended: string }>();
    const ENRICH_CAP = 2000;
    if (data.program === "kkb" && filtered.length > 0 && filtered.length <= ENRICH_CAP) {
      try {
        // Query only the picked people's rows. Match on either raw or 10-digit phone.
        const wanted = new Set<string>();
        for (const p of filtered) {
          if (p.phoneRaw) wanted.add(p.phoneRaw);
          if (p.phone) wanted.add(p.phone);
        }
        const list = Array.from(wanted);
        const chunks: string[][] = [];
        for (let i = 0; i < list.length; i += 500) chunks.push(list.slice(i, i + 500));
        const CONCURRENCY = 8;
        for (let w = 0; w < chunks.length; w += CONCURRENCY) {
          const wave = chunks.slice(w, w + CONCURRENCY);
          const results = await Promise.all(
            wave.map((chunk) =>
              client
                .from("kkb_mastersheet")
                .select("phone, phone_number, recommendations_input, jobs_recommended")
                .in("phone", chunk)
                .then((r) => (r.error ? [] : (r.data ?? [])) as Record<string, unknown>[]),
            ),
          );
          for (const rows of results) {
            for (const r of rows) {
              const key = norm10(String(r.phone ?? r.phone_number ?? ""));
              if (!key) continue;
              const rec = r.recommendations_input;
              const jr = r.jobs_recommended;
              const recStr = rec == null ? "" : typeof rec === "string" ? rec : JSON.stringify(rec);
              const jrStr = jr == null ? "" : typeof jr === "string" ? jr : JSON.stringify(jr);
              if (recStr || jrStr) recByPhone.set(key, { recommendations: recStr, jobs_recommended: jrStr });
            }
          }
        }
      } catch { /* best-effort enrichment */ }
    }

    let enrichedCount = 0;
    const contacts = filtered.map((p) => {
      const base: Record<string, string> = {
        contact_name: p.name || (data.program === "dkb" ? "Provider" : "Seeker"),
        contact_phone: p.phone,
        country_code: "91",
        person_id: p.person_id,
      };
      const enr = recByPhone.get(p.phone);
      if (enr) {
        if (enr.recommendations) base.recommendations = enr.recommendations;
        if (enr.jobs_recommended) base.jobs_recommended = enr.jobs_recommended;
        enrichedCount++;
      }
      return base;
    });
    return { contacts, enrichedCount, enrichmentSkipped: filtered.length > 2000 };
  });
